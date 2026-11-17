/**
 * Direct Bluetooth control of amaran / Aputure lights, no amaran Desktop.
 *
 * The lights form a Bluetooth Mesh network. Any one of them works as a
 * "proxy": we connect to it over GATT (Mesh Proxy service 0x1828) and it
 * relays our messages to every light in the mesh. Messages are encrypted with
 * the mesh NetKey / AppKey, which come from the Sidus account (exported from
 * amaran Desktop, see scripts/export-amaran-mesh.mjs).
 *
 * REVERSE ENGINEERED (wesbos/amaran-BLE-control). Runs natively in the
 * Capacitor app (iPhone / iPad / Android) or over Web Bluetooth in Chrome /
 * Edge (https or localhost). See ./transport.ts.
 */
import { Fixture, FixtureType } from '../../types/cine';
import { GEL_PRESETS } from '../../data/initialData';
import { profileFor } from '../../data/fixtureProfiles';
import { D65, rgbToHueSat, xyToRgb } from '../../utils/color';
import {
  NetworkKeys,
  PROXY_TYPE,
  decodeNetworkPdu,
  encodeAccessTransport,
  encodeNetworkPdu,
  fromHex,
  hex,
  k2,
  k4,
  proxyPdu,
} from './meshCrypto';
import * as telink from './telink';
import { BleHandle, ProxyLink, bleBackend } from './transport';

const ALL_NODES = 0xffff;
const DEFAULT_GROUP = 0xc000;
const TTL = 10;
const RETRY_MS = 3000;

// ---------------------------------------------------------------------------
// Mesh configuration (keys + node list)

export interface MeshNodeInfo {
  /** Unicast address of the light's primary element. */
  address: number;
  name: string;
  model?: FixtureType;
}

export interface BleMeshConfig {
  netKey: string; // 32 hex chars
  appKey: string; // 32 hex chars
  ivIndex: number;
  /** Our own source address in the mesh. */
  src: number;
  nodes: MeshNodeInfo[];
}

const KEY_RE = /^[0-9a-f]{32}$/i;

export function checkMeshConfig(c: Partial<BleMeshConfig>): string | null {
  if (!c.netKey || !KEY_RE.test(c.netKey)) return 'NetKey must be 32 hex characters';
  if (!c.appKey || !KEY_RE.test(c.appKey)) return 'AppKey must be 32 hex characters';
  if (c.src === undefined || c.src < 1 || c.src > 0x7fff) return 'Source address must be 0x0001–0x7FFF';
  return null;
}

/** Parse a node list typed as "2 Key Light" / "0x0004, Back Light" lines. */
export function parseNodeLines(text: string): MeshNodeInfo[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap((l) => {
      const m = /^(0x[0-9a-f]+|\d+)\s*[,;:\t ]\s*(.*)$/i.exec(l) ?? /^(0x[0-9a-f]+|\d+)$/i.exec(l);
      if (!m) return [];
      const address = Number(m[1]);
      if (!(address > 0 && address < 0x8000)) return [];
      return [{ address, name: (m[2] ?? '').trim() || `Light ${address}` }];
    });
}

export const formatNodeLines = (nodes: MeshNodeInfo[]) => nodes.map((n) => `${n.address} ${n.name}`).join('\n');

/**
 * Accepts our own export (scripts/export-amaran-mesh.mjs) or a Bluetooth SIG
 * Mesh Configuration Database JSON (nRF Mesh and similar apps).
 */
export function parseMeshJson(text: string): Partial<BleMeshConfig> {
  const j = JSON.parse(text);
  const pickKey = (v: unknown) => (typeof v === 'string' ? v.replace(/[^0-9a-f]/gi, '') : undefined);
  if (Array.isArray(j.netKeys)) {
    // Mesh CDB format
    const nodes: MeshNodeInfo[] = (j.nodes ?? [])
      .filter((n: { unicastAddress?: string }) => n.unicastAddress)
      .map((n: { unicastAddress: string; name?: string }) => ({
        address: parseInt(n.unicastAddress, 16),
        name: n.name || `Node ${n.unicastAddress}`,
      }));
    const provisioner = j.provisioners?.[0]?.allocatedUnicastRange?.[0]?.lowAddress;
    return {
      netKey: pickKey(j.netKeys[0]?.key),
      appKey: pickKey(j.appKeys?.[0]?.key),
      ivIndex: typeof j.ivIndex === 'number' ? j.ivIndex : undefined,
      src: provisioner ? parseInt(provisioner, 16) : undefined,
      nodes,
    };
  }
  return {
    netKey: pickKey(j.netKey),
    appKey: pickKey(j.appKey),
    ivIndex: typeof j.ivIndex === 'number' ? j.ivIndex : undefined,
    src: typeof j.src === 'number' ? j.src : undefined,
    nodes: Array.isArray(j.nodes)
      ? j.nodes
          .map((n: { address: number | string; name?: string }) => ({
            address: typeof n.address === 'string' ? Number(n.address) : n.address,
            name: n.name || `Light ${n.address}`,
          }))
          .filter((n: MeshNodeInfo) => n.address > 0 && n.address < 0x8000)
      : undefined,
  };
}

const CONFIG_KEY = 'cinelight.bleMesh';
const SEQ_KEY = 'cinelight.bleMesh.seq';

export interface StoredMesh {
  config: Partial<BleMeshConfig>;
  rememberKeys: boolean;
}

export function loadMeshSettings(): StoredMesh {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<BleMeshConfig>;
      return { config: s, rememberKeys: !!s.netKey };
    }
  } catch {
    /* storage unavailable */
  }
  return { config: { src: 0x0001, ivIndex: 0, nodes: [] }, rememberKeys: false };
}

export function saveMeshSettings(c: BleMeshConfig, rememberKeys: boolean) {
  try {
    const { netKey, appKey, ...rest } = c;
    localStorage.setItem(CONFIG_KEY, JSON.stringify(rememberKeys ? c : rest));
  } catch {
    /* storage unavailable */
  }
}

// ---------------------------------------------------------------------------
// Sequence numbers must only go up (replay protection on every light).

class SeqCounter {
  private next = 0;
  private reserved = 0;

  take(): number {
    if (this.next === 0) {
      let stored = 0;
      try {
        stored = Number(localStorage.getItem(SEQ_KEY)) || 0;
      } catch {
        /* storage unavailable */
      }
      // Start high so we stay above whatever amaran Desktop / the phone app used.
      this.next = stored || 12_000_000 + Math.floor(Math.random() * 4_000_000);
      this.reserved = this.next;
    }
    const seq = this.next;
    this.next = (this.next + 1) & 0xffffff;
    if (this.next >= this.reserved) {
      this.reserved = this.next + 256;
      try {
        localStorage.setItem(SEQ_KEY, String(this.reserved));
      } catch {
        /* storage unavailable */
      }
    }
    return seq;
  }
}

// ---------------------------------------------------------------------------
// Session: one GATT connection to a proxy light.

export type BleMeshStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type Listener<T> = (v: T) => void;

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

export class BleMeshSession {
  private handle: BleHandle | null = null;
  private link: ProxyLink | null = null;
  private config: BleMeshConfig | null = null;
  private netKeys: NetworkKeys | null = null;
  private appKey: Uint8Array | null = null;
  private aid = 0;
  private seq = new SeqCounter();
  private writeChain: Promise<void> = Promise.resolve();
  /** Write proxy PDUs in 20-byte segments (for links with the default MTU). */
  private segmented = false;
  private rxBuffer: number[] = [];
  private filterAck: (() => void) | null = null;
  private wantConnected = false;
  private retryTimer: number | null = null;
  private statusListeners = new Set<Listener<BleMeshStatus>>();
  private _status: BleMeshStatus = 'disconnected';
  lastError: string | null = null;

  get status() {
    return this._status;
  }
  get proxyName() {
    return this.handle?.name ?? '';
  }
  get proxyId() {
    return this.handle?.id ?? '';
  }
  get currentConfig() {
    return this.config;
  }

  onStatus(fn: Listener<BleMeshStatus>) {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  private setStatus(s: BleMeshStatus) {
    this._status = s;
    this.statusListeners.forEach((fn) => fn(s));
  }

  configure(c: BleMeshConfig) {
    const err = checkMeshConfig(c);
    if (err) throw new Error(err);
    this.config = c;
    this.netKeys = k2(fromHex(c.netKey));
    this.appKey = fromHex(c.appKey);
    this.aid = k4(this.appKey);
  }

  /**
   * Opens the system / browser Bluetooth picker. Must run from a tap,
   * before any other await.
   */
  async connect(): Promise<void> {
    if (!this.config) throw new Error('Load the mesh keys first');
    const handle = await bleBackend().choose();
    if (this.handle && this.handle.id !== handle.id) this.disconnect();
    this.handle = handle;
    this.wantConnected = true;
    await this.open();
  }

  /** Reconnect to the last chosen light without the picker. */
  async reconnect(): Promise<void> {
    if (!this.handle) throw new Error('Choose a light over Bluetooth first');
    this.wantConnected = true;
    if (this._status === 'connected' && this.link) return;
    await this.open();
  }

  disconnect() {
    this.wantConnected = false;
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.link = null;
    this.handle?.close();
    if (this._status !== 'disconnected') this.setStatus('disconnected');
  }

  private onLinkDropped = () => {
    this.link = null;
    if (this._status === 'connected') {
      this.lastError = 'Bluetooth link lost. Retrying…';
      this.setStatus('disconnected');
    }
    this.scheduleRetry();
  };

  private scheduleRetry() {
    if (!this.wantConnected || this.retryTimer !== null) return;
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      if (!this.wantConnected || this._status === 'connected') return;
      this.open().catch(() => this.scheduleRetry());
    }, RETRY_MS);
  }

  private async open() {
    if (!this.handle || !this.config) throw new Error('Not configured');
    this.lastError = null;
    this.setStatus('connecting');
    try {
      this.link = await this.handle.open((d) => this.onNotify(d), this.onLinkDropped);
      this.segmented = this.link.maxWrite !== null && this.link.maxWrite < 30;
      await sleep(500);
      await this.setupFilter();
      this.setStatus('connected');
    } catch (e) {
      this.link = null;
      this.lastError = (e as Error).message;
      this.setStatus('error');
      throw e;
    }
  }

  /**
   * The proxy drops relayed traffic until it has a filter: whitelist our own
   * address, the all-nodes and default group addresses, and every light.
   */
  private async setupFilter() {
    const cfg = this.config!;
    const ack = new Promise<void>((resolve) => {
      this.filterAck = resolve;
      window.setTimeout(resolve, 2000);
    });
    await this.sendProxyConfig(0x00, [0x00]); // Set Filter Type: whitelist
    await ack;
    this.filterAck = null;
    const addrs = [cfg.src, ALL_NODES, DEFAULT_GROUP, ...cfg.nodes.map((n) => n.address)];
    const params: number[] = [];
    for (const a of addrs) params.push((a >> 8) & 0xff, a & 0xff);
    // Keep each config message unsegmented: at most 5 addresses at a time.
    for (let i = 0; i < params.length; i += 10) await this.sendProxyConfig(0x01, params.slice(i, i + 10));
    await sleep(300);
  }

  private async sendProxyConfig(opcode: number, params: number[]) {
    const cfg = this.config!;
    const pdu = encodeNetworkPdu({
      keys: this.netKeys!,
      ivIndex: cfg.ivIndex,
      ctl: true,
      ttl: 0,
      seq: this.seq.take(),
      src: cfg.src,
      dst: 0x0000,
      transportPdu: new Uint8Array([opcode & 0x7f, ...params]),
      nonceType: 'proxy',
    });
    await this.write(proxyPdu(PROXY_TYPE.CONFIG, pdu));
  }

  /** Send one Telink payload to a light (or a group address). */
  sendTelink(dst: number, payload: Uint8Array): Promise<void> {
    if (this._status !== 'connected' || !this.config) return Promise.resolve();
    const cfg = this.config;
    const seq = this.seq.take();
    const lower = encodeAccessTransport({
      appKey: this.appKey!,
      aid: this.aid,
      ivIndex: cfg.ivIndex,
      seq,
      src: cfg.src,
      dst,
      accessPdu: telink.accessPdu(payload),
    });
    const pdu = encodeNetworkPdu({
      keys: this.netKeys!,
      ivIndex: cfg.ivIndex,
      ctl: false,
      ttl: TTL,
      seq,
      src: cfg.src,
      dst,
      transportPdu: lower,
    });
    return this.write(proxyPdu(PROXY_TYPE.NETWORK, pdu));
  }

  /** GATT allows one operation at a time: chain every write. */
  private write(data: Uint8Array): Promise<void> {
    const run = async () => {
      const link = this.link;
      if (!link) return;
      if (!this.segmented) {
        try {
          await link.write(data);
          return;
        } catch (e) {
          // Too long for the negotiated MTU: fall back to proxy SAR segments.
          if (!(e instanceof DOMException) || data.length <= 20) throw e;
          this.segmented = true;
        }
      }
      const type = data[0] & 0x3f;
      const body = data.subarray(1);
      const chunk = Math.max(19, (link.maxWrite ?? 20) - 1);
      for (let i = 0; i < body.length; i += chunk) {
        const first = i === 0;
        const last = i + chunk >= body.length;
        const sar = first && last ? 0 : first ? 1 : last ? 3 : 2;
        const seg = new Uint8Array(1 + Math.min(chunk, body.length - i));
        seg[0] = (sar << 6) | type;
        seg.set(body.subarray(i, i + chunk), 1);
        await link.write(seg);
      }
    };
    const p = this.writeChain.then(run, run);
    this.writeChain = p.catch(() => undefined);
    return p;
  }

  private onNotify(chunk: Uint8Array) {
    const sar = chunk[0] >> 6;
    if (sar === 0) this.onProxyPdu(chunk);
    else {
      if (sar === 1) this.rxBuffer = [chunk[0] & 0x3f];
      this.rxBuffer.push(...chunk.subarray(1));
      if (sar === 3) this.onProxyPdu(new Uint8Array(this.rxBuffer));
    }
  }

  private onProxyPdu(data: Uint8Array) {
    const type = data[0] & 0x3f;
    if (type === PROXY_TYPE.BEACON && data[1] === 0x01 && data.length >= 15 && this.config) {
      // Secure Network Beacon: learn the current IV index.
      const iv = ((data[11] << 24) | (data[12] << 16) | (data[13] << 8) | data[14]) >>> 0;
      const networkId = hex(data.subarray(3, 11));
      if (iv !== this.config.ivIndex && networkId) {
        this.config = { ...this.config, ivIndex: iv };
        // IV changed: messages sent so far were ignored, so send again.
        this.statusListeners.forEach((fn) => fn(this._status));
      }
      return;
    }
    if (type === PROXY_TYPE.CONFIG && this.netKeys && this.config) {
      const msg = decodeNetworkPdu(data.subarray(1), this.netKeys, this.config.ivIndex, 'proxy');
      if (msg && msg.transportPdu[0] === 0x03) this.filterAck?.(); // Filter Status
    }
  }
}

export const bleMesh = new BleMeshSession();

// ---------------------------------------------------------------------------
// Fixture state → Telink commands, throttled per light.

const MIN_INTERVAL_MS = 80;
const REPEAT_AFTER_MS = 350;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function hexToHueSat(h: string) {
  const n = parseInt(h.replace('#', ''), 16);
  return rgbToHueSat({ r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 });
}

export interface BleCommand {
  on: boolean;
  /** Colour/level payload, or null when the light is off. */
  payload: Uint8Array | null;
}

export function bleCommandFor(f: Fixture, outputLevel: number): BleCommand {
  const v = Math.round(clamp(outputLevel, 0, 100) * 10);
  if (!f.power || v <= 0) return { on: false, payload: null };
  const profile = profileFor(f);
  const color = profile.capability === 'FULL_COLOR';
  const gm = profile.supportsTint ? Math.round(clamp(f.tint, -1, 1) * 10) : 0;
  const white = () => telink.cct(clamp(f.cct, profile.cctMin, profile.cctMax), v, gm);
  if (!color) return { on: true, payload: white() };
  if (f.colorMode === 'HSI') return { on: true, payload: telink.hsi(f.hue, f.saturation, v) };
  if (f.colorMode === 'XY') {
    const hs = rgbToHueSat(xyToRgb(f.xy ?? D65));
    return { on: true, payload: telink.hsi(hs.hue, hs.saturation, v) };
  }
  if (f.colorMode === 'GEL') {
    const gel = GEL_PRESETS.find((g) => `${g.code} ${g.name}` === f.gelName);
    if (gel) {
      const hs = hexToHueSat(gel.hex);
      return { on: true, payload: telink.hsi(hs.hue, hs.saturation, v) };
    }
  }
  return { on: true, payload: white() };
}

interface NodeQueue {
  desired: BleCommand | null;
  sentKey: string;
  sentOn: boolean | null;
  lastSendAt: number;
  timer: number | null;
  repeatTimer: number | null;
}

const keyOf = (c: BleCommand) => (c.payload ? hex(c.payload) : 'off');

export class BleMeshSender {
  private nodes = new Map<number, NodeQueue>();

  private node(addr: number): NodeQueue {
    let n = this.nodes.get(addr);
    if (!n) {
      n = { desired: null, sentKey: '', sentOn: null, lastSendAt: 0, timer: null, repeatTimer: null };
      this.nodes.set(addr, n);
    }
    return n;
  }

  queue(addr: number, cmd: BleCommand) {
    const n = this.node(addr);
    n.desired = cmd;
    if (keyOf(cmd) === n.sentKey && n.sentOn === cmd.on) return;
    this.schedule(addr, n);
  }

  /** Forget what was sent, so the next state goes out in full. */
  resync(addr?: number) {
    const targets = addr === undefined ? [...this.nodes.keys()] : [addr];
    for (const a of targets) {
      const n = this.node(a);
      n.sentKey = '';
      n.sentOn = null;
      if (n.desired) this.schedule(a, n);
    }
  }

  forget(addr: number) {
    const n = this.nodes.get(addr);
    if (n?.timer) window.clearTimeout(n.timer);
    if (n?.repeatTimer) window.clearTimeout(n.repeatTimer);
    this.nodes.delete(addr);
  }

  private schedule(addr: number, n: NodeQueue) {
    if (n.timer !== null) return;
    const wait = Math.max(0, n.lastSendAt + MIN_INTERVAL_MS - Date.now());
    n.timer = window.setTimeout(() => {
      n.timer = null;
      void this.flush(addr, n);
    }, wait);
  }

  private async flush(addr: number, n: NodeQueue, repeat = false) {
    const cmd = n.desired;
    if (!cmd || bleMesh.status !== 'connected') return;
    n.lastSendAt = Date.now();
    try {
      if (!cmd.on) {
        await bleMesh.sendTelink(addr, telink.onOff(false));
      } else {
        if (n.sentOn !== true || repeat) await bleMesh.sendTelink(addr, telink.onOff(true));
        if (cmd.payload) await bleMesh.sendTelink(addr, cmd.payload);
      }
      n.sentOn = cmd.on;
      n.sentKey = keyOf(cmd);
    } catch {
      return; // link dropped; resync on reconnect
    }
    // Writes are unacknowledged and the mesh can drop a hop: repeat the final
    // state once things settle.
    if (!repeat) {
      if (n.repeatTimer) window.clearTimeout(n.repeatTimer);
      n.repeatTimer = window.setTimeout(() => {
        n.repeatTimer = null;
        if (n.timer === null && n.desired && keyOf(n.desired) === n.sentKey) void this.flush(addr, n, true);
      }, REPEAT_AFTER_MS);
    }
  }
}

export const bleMeshSender = new BleMeshSender();

export const meshDeviceId = (addr: number) => `mesh-${addr.toString(16).padStart(4, '0')}`;
export const meshAddressOf = (deviceId: string): number | null => {
  const m = /^mesh-([0-9a-f]{4})$/.exec(deviceId);
  return m ? parseInt(m[1], 16) : null;
};
