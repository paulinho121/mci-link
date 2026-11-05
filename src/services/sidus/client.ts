/**
 * Client for the amaran Desktop OpenAPI (official, by Sidus).
 * Docs: https://tools.sidus.link/openapi/docs/usage
 *
 * amaran Desktop runs a WebSocket server on 0.0.0.0:12345. Every request
 * carries a fresh token: AES-256-GCM(secret, current unix time), encoded as
 * base64(iv[12] | tag[16] | ciphertext). Tokens expire after ~10 s.
 *
 * AES-GCM comes from @noble/ciphers (pure JS) instead of WebCrypto, because
 * crypto.subtle only exists in secure contexts and a tablet opening the app
 * over plain http on the LAN would not have it.
 */
import { gcm } from '@noble/ciphers/aes.js';

export const SIDUS_DEFAULT_PORT = 12345;
const PROTOCOL_VERSION = 2;
const REQUEST_TIMEOUT_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 4000;
const HEARTBEAT_TIMEOUT_MS = 2500;
const RETRY_INTERVAL_MS = 3000;

export type SidusConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SidusSettings {
  host: string;
  port: number;
  /** Base64 AES-256 key issued by Sidus for the OpenAPI. */
  secretKey: string;
}

export interface SidusNode {
  id: string;
  name: string;
  node_id: string;
}

export interface SidusNodeConfig {
  cct_support: boolean;
  cct_min: number;
  cct_max: number;
  cct_extension_support: boolean;
  cct_extension_min: number;
  cct_extension_max: number;
  cct_extension_enabled: boolean;
  gm_support: boolean;
  gm_min: number;
  gm_max: number;
  gm_v2_support: boolean;
  hsi_support: boolean;
  rgb_support: boolean;
  advanced_hsi_support: boolean;
}

export type SidusEventType =
  | 'sleep_changed'
  | 'intensity_changed'
  | 'cct_changed'
  | 'hsi_changed'
  | 'rgb_changed'
  | 'effect_changed';

export interface SidusEvent {
  version: number;
  type: 'event';
  event: SidusEventType;
  /** client_id of the API client that caused it, "openapi", or "app". */
  cause_by?: number | string;
  node_id?: string;
  data?: unknown;
}

export const SIDUS_ERRORS: Record<number, string> = {
  1001: 'Invalid request',
  2001: 'Invalid token (check the API secret key)',
  2002: 'Token expired (check the PC clock)',
  3001: 'Device or group not found',
  3002: 'Preset not found',
  3003: 'Quickshot not found',
  3004: 'Device or group does not support the effect',
  9001: 'Unknown error',
};

export class SidusError extends Error {
  constructor(public code: number, message: string) {
    super(`${SIDUS_ERRORS[code] ?? message} (code ${code})`);
  }
}

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0));
const bytesToB64 = (bytes: Uint8Array) => {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
};

/** Validate a secret key without connecting. Returns an error message or null. */
export function checkSecretKey(secretKey: string): string | null {
  try {
    const key = b64ToBytes(secretKey);
    return key.length === 32 ? null : `Key must decode to 32 bytes (got ${key.length})`;
  } catch {
    return 'Key is not valid base64';
  }
}

export function generateToken(secretKey: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const key = b64ToBytes(secretKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  // noble returns ciphertext || tag(16); the API wants iv | tag | ciphertext.
  const sealed = gcm(key, iv).encrypt(new TextEncoder().encode(String(nowSeconds)));
  const ciphertext = sealed.slice(0, sealed.length - 16);
  const tag = sealed.slice(sealed.length - 16);
  const out = new Uint8Array(12 + 16 + ciphertext.length);
  out.set(iv, 0);
  out.set(tag, 12);
  out.set(ciphertext, 28);
  return bytesToB64(out);
}

interface Pending {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: number;
}

type Listener<T> = (value: T) => void;

export class SidusClient {
  readonly clientId = Math.floor(Math.random() * 1_000_000) + 1;
  private ws: WebSocket | null = null;
  private settings: SidusSettings | null = null;
  private nextRequestId = 1;
  private pending = new Map<number, Pending>();
  private statusListeners = new Set<Listener<SidusConnectionStatus>>();
  private eventListeners = new Set<Listener<SidusEvent>>();
  private _status: SidusConnectionStatus = 'disconnected';
  private heartbeatTimer: number | null = null;
  private retryTimer: number | null = null;
  /** True between a user connect() and disconnect(): drives auto-retry. */
  private wantConnected = false;
  lastError: string | null = null;

  get status() {
    return this._status;
  }

  get currentSettings() {
    return this.settings;
  }

  get url() {
    return this.settings ? `ws://${this.settings.host}:${this.settings.port}` : '';
  }

  onStatus(fn: Listener<SidusConnectionStatus>) {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  onEvent(fn: Listener<SidusEvent>) {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  private setStatus(s: SidusConnectionStatus) {
    this._status = s;
    this.statusListeners.forEach((fn) => fn(s));
  }

  /**
   * A dead PC or a crashed amaran Desktop can leave the socket half-open
   * (the browser never gets a close), so ping it and drop it on silence.
   */
  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      this.request('get_protocol_versions', undefined, undefined, HEARTBEAT_TIMEOUT_MS).catch(() => this.handleDrop());
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer !== null) window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  /** Connection lost without the user asking: tear down and keep retrying. */
  private handleDrop() {
    if (this._status !== 'connected') return;
    this.teardown();
    this.lastError = 'Lost connection to amaran Desktop. Retrying…';
    this.setStatus('disconnected');
    this.scheduleRetry();
  }

  private scheduleRetry() {
    if (!this.wantConnected || !this.settings || this.retryTimer !== null) return;
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      if (!this.wantConnected || !this.settings || this._status === 'connected') return;
      this.open(this.settings).catch(() => this.scheduleRetry());
    }, RETRY_INTERVAL_MS);
  }

  private teardown() {
    this.stopHeartbeat();
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.rejectAll(new Error('Disconnected'));
  }

  /** Open the socket and verify the key with get_protocol_versions. */
  async connect(settings: SidusSettings): Promise<void> {
    this.wantConnected = true;
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    return this.open(settings);
  }

  private async open(settings: SidusSettings): Promise<void> {
    const keyError = checkSecretKey(settings.secretKey);
    if (keyError) throw new Error(keyError);
    this.teardown();
    this.settings = settings;
    this.lastError = null;
    this.setStatus('connecting');

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      const fail = (msg: string) => {
        this.lastError = msg;
        this.setStatus('error');
        reject(new Error(msg));
      };
      ws.onopen = () => resolve();
      ws.onerror = () => fail(`Cannot reach amaran Desktop at ${this.url}. Is the app open?`);
      ws.onmessage = (e) => this.handleMessage(e.data);
      ws.onclose = () => {
        if (this.ws !== ws) return;
        if (this._status === 'connected') {
          this.handleDrop();
          return;
        }
        this.ws = null;
        this.rejectAll(new Error('Connection closed'));
      };
    });

    try {
      const versions = (await this.request('get_protocol_versions')) as number[];
      if (Array.isArray(versions) && !versions.includes(PROTOCOL_VERSION)) {
        throw new Error(`amaran Desktop does not support protocol v${PROTOCOL_VERSION} (has ${versions.join(', ')})`);
      }
    } catch (e) {
      this.lastError = (e as Error).message;
      this.ws?.close();
      this.setStatus('error');
      throw e;
    }
    this.lastError = null;
    this.setStatus('connected');
    this.startHeartbeat();
  }

  /** Reconnect with the last settings used. */
  reconnect() {
    if (!this.settings) return Promise.reject(new Error('Not configured'));
    return this.connect(this.settings);
  }

  /** Close on purpose: no automatic retries. */
  disconnect() {
    this.wantConnected = false;
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.teardown();
    if (this._status !== 'disconnected') this.setStatus('disconnected');
  }

  request<T = unknown>(
    action: string,
    nodeId?: string,
    args?: Record<string, unknown>,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || !this.settings) {
      return Promise.reject(new Error('Not connected to amaran Desktop'));
    }
    const requestId = this.nextRequestId++;
    const msg: Record<string, unknown> = {
      version: PROTOCOL_VERSION,
      type: 'request',
      client_id: this.clientId,
      request_id: requestId,
      action,
      token: generateToken(this.settings.secretKey),
    };
    if (nodeId) msg.node_id = nodeId;
    if (args) msg.args = args;

    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`${action}: no response from amaran Desktop`));
      }, timeoutMs);
      this.pending.set(requestId, { resolve: resolve as (d: unknown) => void, reject, timer });
      ws.send(JSON.stringify(msg));
    });
  }

  private handleMessage(raw: unknown) {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.type === 'event') {
      this.eventListeners.forEach((fn) => fn(msg as unknown as SidusEvent));
      return;
    }
    if (msg.type !== 'response') return;
    const p = this.pending.get(Number(msg.request_id));
    if (!p) return;
    this.pending.delete(Number(msg.request_id));
    window.clearTimeout(p.timer);
    const code = Number(msg.code);
    if (code === 0) p.resolve(msg.data);
    else p.reject(new SidusError(code, String(msg.message ?? 'error')));
  }

  private rejectAll(err: Error) {
    this.pending.forEach((p) => {
      window.clearTimeout(p.timer);
      p.reject(err);
    });
    this.pending.clear();
  }
}

/** One shared connection for the whole app. */
export const sidus = new SidusClient();
