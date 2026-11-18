/**
 * DMX over Bluetooth to lights with a LumenRadio TimoTwo module
 * (Creamsource Vortex4 / Vortex8 / Vortex24, and other CRMX fixtures that
 * enable "CRMX BLE").
 *
 * OFFICIAL protocol, documented by LumenRadio:
 * https://docs.lumenrad.io/timotwo/ble-interface/
 *   DMX service        bfa00000-247d-6e1c-448c-223dfa0bd00c
 *   DMX characteristic bfa00001-247d-6e1c-448c-223dfa0bd00c (write)
 *   Each write = one or more changes: 16-bit little-endian header
 *   (bits 15-9 = number of slots, bits 8-0 = first slot − 1) + 1 byte/slot.
 *   All 512 slots must be written once before the module outputs DMX.
 *   Values persist until changed, so only changes are sent.
 *
 * One Bluetooth connection per light. Works natively in the Capacitor app
 * and over Web Bluetooth (Chrome / Edge / Bluefy).
 */
import { Capacitor } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';

export const TIMO_DMX_SERVICE = 'bfa00000-247d-6e1c-448c-223dfa0bd00c';
export const TIMO_DMX_CHAR = 'bfa00001-247d-6e1c-448c-223dfa0bd00c';

const NAME_PREFIXES = ['Vortex', 'VORTEX', 'vortex', 'TimoTwo', 'Creamsource', 'CS-', 'LS 600', 'LS600', 'Aputure', 'APUTURE'];
const MAX_SLOTS_PER_CHANGE = 127; // 7-bit count
const FLUSH_DELAY_MS = 25;
const RETRY_MS = 3000;
const SAFE_PAYLOAD = 20; // default ATT MTU 23 − 3
const OPEN_ATTEMPTS = 3;

/** Encode one change: slots [start, start + data.length), start is 0-based. */
export function encodeChange(start: number, data: ArrayLike<number>): Uint8Array {
  if (data.length < 1 || data.length > MAX_SLOTS_PER_CHANGE) throw new Error('1–127 slots per change');
  if (start < 0 || start + data.length > 512) throw new Error('Slot out of range');
  const header = ((data.length & 0x7f) << 9) | (start & 0x1ff);
  const out = new Uint8Array(2 + data.length);
  out[0] = header & 0xff;
  out[1] = (header >> 8) & 0xff;
  out.set(Array.from(data), 2);
  return out;
}

/**
 * Pack the changed ranges into writes of at most `maxPayload` bytes.
 * Ranges are [start, end) over the 512-slot buffer.
 */
export function packWrites(slots: Uint8Array, ranges: [number, number][], maxPayload: number): Uint8Array[] {
  const perChange = Math.min(MAX_SLOTS_PER_CHANGE, maxPayload - 2);
  const writes: Uint8Array[] = [];
  let current: number[] = [];
  for (const [a, b] of ranges) {
    for (let s = a; s < b; s += perChange) {
      const change = encodeChange(s, slots.subarray(s, Math.min(b, s + perChange)));
      if (current.length + change.length > maxPayload) {
        writes.push(Uint8Array.from(current));
        current = [];
      }
      current.push(...change);
    }
  }
  if (current.length) writes.push(Uint8Array.from(current));
  return writes;
}

/** Ranges where `next` differs from `prev`; close gaps are merged. */
export function diffRanges(prev: Uint8Array, next: Uint8Array): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < 512; i++) {
    if (prev[i] === next[i]) continue;
    const last = out[out.length - 1];
    if (last && i - last[1] <= 2) last[1] = i + 1;
    else out.push([i, i + 1]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Platform BLE (native Capacitor or Web Bluetooth)

interface Gatt {
  write(data: Uint8Array): Promise<void>;
  maxPayload: number | null;
  close(): void;
}

interface Picked {
  id: string;
  name: string;
  open(onDisconnect: () => void): Promise<Gatt>;
}

const isNative = () => Capacitor.isNativePlatform();
let nativeReady: Promise<void> | null = null;
const initNative = () => (nativeReady ??= BleClient.initialize({ androidNeverForLocation: true }));

const NOT_TIMO =
  'This device has no LumenRadio DMX service. On the light: LINK → CRMX Settings → turn on CRMX and CRMX BLE.';

async function pickNative(): Promise<Picked> {
  await initNative();
  // No filter: the DMX service may not be in the advertisement.
  const d = await BleClient.requestDevice({ optionalServices: [TIMO_DMX_SERVICE] });
  return { id: d.deviceId, name: d.name ?? 'Bluetooth light', open: (onDrop) => openNative(d.deviceId, onDrop) };
}

async function openNative(id: string, onDrop: () => void): Promise<Gatt> {
  await initNative();
  await BleClient.connect(id, () => onDrop());
  const services = await BleClient.getServices(id);
  const svc = services.find((s) => s.uuid.toLowerCase() === TIMO_DMX_SERVICE);
  const ch = svc?.characteristics.find((c) => c.uuid.toLowerCase() === TIMO_DMX_CHAR);
  if (!ch) {
    await BleClient.disconnect(id).catch(() => undefined);
    throw new Error(NOT_TIMO);
  }
  const noResponse = !!ch.properties.writeWithoutResponse;
  const mtu = await BleClient.getMtu(id).catch(() => 23);
  return {
    maxPayload: Math.max(SAFE_PAYLOAD, mtu - 3),
    write: (d) => {
      const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
      return noResponse
        ? BleClient.writeWithoutResponse(id, TIMO_DMX_SERVICE, TIMO_DMX_CHAR, v)
        : BleClient.write(id, TIMO_DMX_SERVICE, TIMO_DMX_CHAR, v);
    },
    close: () => void BleClient.disconnect(id).catch(() => undefined),
  };
}

interface WebChar {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValueWithoutResponse(d: Uint8Array): Promise<void>;
  writeValueWithResponse(d: Uint8Array): Promise<void>;
}
interface WebDevice extends EventTarget {
  id: string;
  name?: string;
  gatt?: {
    connect(): Promise<{ getPrimaryService(u: string): Promise<{ getCharacteristic(u: string): Promise<WebChar> }> }>;
    disconnect(): void;
  };
}

async function pickWeb(showAll = false): Promise<Picked> {
  const bt = (navigator as unknown as { bluetooth?: { requestDevice(o: unknown): Promise<WebDevice> } }).bluetooth;
  if (!bt) throw new Error('Bluetooth is not available in this browser.');
  const device = await bt.requestDevice(
    showAll
      ? { acceptAllDevices: true, optionalServices: [TIMO_DMX_SERVICE] }
      : {
          filters: [{ services: [TIMO_DMX_SERVICE] }, ...NAME_PREFIXES.map((namePrefix) => ({ namePrefix }))],
          optionalServices: [TIMO_DMX_SERVICE],
        },
  );
  let onDrop: (() => void) | null = null;
  device.addEventListener('gattserverdisconnected', () => onDrop?.());
  return {
    id: device.id,
    name: device.name ?? 'Bluetooth light',
    async open(drop) {
      if (!device.gatt) throw new Error(NOT_TIMO);
      onDrop = drop;
      const server = await device.gatt.connect();
      let ch: WebChar;
      try {
        ch = await (await server.getPrimaryService(TIMO_DMX_SERVICE)).getCharacteristic(TIMO_DMX_CHAR);
      } catch {
        onDrop = null;
        device.gatt.disconnect();
        throw new Error(NOT_TIMO);
      }
      const noResponse = ch.properties.writeWithoutResponse;
      return {
        // Web Bluetooth does not report the MTU: start big, shrink on error.
        maxPayload: null,
        write: (d) => (noResponse ? ch.writeValueWithoutResponse(d) : ch.writeValueWithResponse(d)),
        close: () => device.gatt?.disconnect(),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// One light

export type TimoStatus = 'connecting' | 'connected' | 'lost';

class TimoLight {
  readonly slots = new Uint8Array(512);
  /** What the module holds; null = must send all 512 slots. */
  private sent: Uint8Array | null = null;
  private gatt: Gatt | null = null;
  private payload = 180;
  private hasData = false;
  private flushing = false;
  private dirty = false;
  private timer: number | null = null;
  private retryTimer: number | null = null;
  private wanted = true;
  status: TimoStatus = 'connecting';
  lastError: string | null = null;

  constructor(
    readonly picked: Picked,
    private onStatus: (l: TimoLight) => void,
  ) {}

  get id() {
    return this.picked.id;
  }
  get name() {
    return this.picked.name;
  }

  private setStatus(s: TimoStatus) {
    this.status = s;
    this.onStatus(this);
  }

  private opening: Promise<void> | null = null;

  /** Connect, retrying a few times (first GATT connects often fail on Windows). */
  open(): Promise<void> {
    this.wanted = true;
    if (this.gatt) return Promise.resolve();
    // Never run two connection attempts at once.
    this.opening ??= this.openWithRetries().finally(() => (this.opening = null));
    return this.opening;
  }

  private async openWithRetries() {
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.setStatus('connecting');
    let lastError: unknown;
    for (let attempt = 1; attempt <= OPEN_ATTEMPTS; attempt++) {
      try {
        this.gatt = await this.picked.open(this.onDrop);
        this.payload = this.gatt.maxPayload ?? 180;
        this.sent = null;
        this.lastError = null;
        this.setStatus('connected');
        this.schedule();
        return;
      } catch (e) {
        lastError = e;
        console.warn(`[timo] connect attempt ${attempt}/${OPEN_ATTEMPTS} to "${this.name}" failed:`, e);
        if ((e as Error).message === NOT_TIMO) break;
        if (attempt < OPEN_ATTEMPTS) await new Promise((r) => window.setTimeout(r, 800 * attempt));
      }
    }
    this.gatt = null;
    this.lastError = (lastError as Error)?.message ?? String(lastError);
    this.setStatus('lost');
    throw lastError;
  }

  close() {
    this.wanted = false;
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.gatt?.close();
    this.gatt = null;
  }

  private onDrop = () => {
    this.gatt = null;
    console.warn(`[timo] "${this.name}" disconnected`);
    if (!this.wanted) return;
    this.setStatus('lost');
    this.retry();
  };

  private retry() {
    if (this.retryTimer !== null || !this.wanted) return;
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      if (this.wanted && !this.gatt) this.open().catch(() => this.retry());
    }, RETRY_MS);
  }

  /** Set `values` starting at DMX address `address` (1-based). */
  set(address: number, values: number[]) {
    const start = Math.max(0, Math.min(511, address - 1));
    let changed = !this.hasData;
    values.forEach((v, i) => {
      if (start + i < 512 && this.slots[start + i] !== v) {
        this.slots[start + i] = v;
        changed = true;
      }
    });
    this.hasData = true;
    if (changed) this.schedule();
  }

  /** Send everything again on the next flush. */
  resync() {
    this.sent = null;
    this.schedule();
  }

  private schedule() {
    if (this.timer !== null) return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, FLUSH_DELAY_MS);
  }

  private async flush() {
    // Wait for real values before the first full write: the module turns its
    // DMX output on after it, and zeros would black the light out.
    if (!this.gatt || !this.hasData) return;
    if (this.flushing) {
      this.dirty = true;
      return;
    }
    this.flushing = true;
    try {
      const snapshot = this.slots.slice();
      const ranges = this.sent ? diffRanges(this.sent, snapshot) : [[0, 512] as [number, number]];
      for (const w of packWrites(snapshot, ranges, this.payload)) await this.gatt.write(w);
      this.sent = snapshot;
    } catch (e) {
      if (this.payload > SAFE_PAYLOAD && this.gatt) {
        // Likely larger than the MTU: retry with the safe size.
        this.payload = SAFE_PAYLOAD;
        this.sent = null;
        this.dirty = true;
      } else {
        this.lastError = (e as Error).message;
      }
    } finally {
      this.flushing = false;
    }
    if (this.dirty) {
      this.dirty = false;
      this.schedule();
    }
  }
}

// ---------------------------------------------------------------------------
// All lights

type StatusListener = (id: string, status: TimoStatus) => void;

class TimoManager {
  private lights = new Map<string, TimoLight>();
  private listeners = new Set<StatusListener>();

  onStatus(fn: StatusListener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit = (l: TimoLight) => this.listeners.forEach((fn) => fn(l.id, l.status));

  /**
   * System / browser picker. Call straight from a tap. It does not connect
   * yet: the link opens when the light is paired, so it is not left idle
   * (and dropped) while the patch form is filled in.
   */
  /** Next picker lists every Bluetooth device (set right before choose()). */
  showAllNext = false;

  async choose(): Promise<TimoLight> {
    const showAll = this.showAllNext;
    this.showAllNext = false;
    const picked = await (isNative() ? pickNative() : pickWeb(showAll));
    const existing = this.lights.get(picked.id);
    if (existing) return existing;
    const light = new TimoLight(picked, this.emit);
    this.lights.set(picked.id, light);
    return light;
  }

  get(id: string) {
    return this.lights.get(id);
  }

  async reconnect(id: string) {
    const light = this.lights.get(id);
    if (!light) throw new Error('Pair the light again (Bluetooth picker)');
    await light.open();
    light.resync();
  }

  disconnect(id: string) {
    this.lights.get(id)?.close();
    this.lights.delete(id);
  }
}

export const timo = new TimoManager();
