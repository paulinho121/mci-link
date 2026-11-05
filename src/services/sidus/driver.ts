import { Fixture, FixtureCapabilities, FixtureType } from '../../types/cine';
import { GEL_PRESETS } from '../../data/initialData';
import { D65, rgbToHueSat, xyToRgb } from '../../utils/color';
import { SidusError, SidusEvent, SidusNode, SidusNodeConfig, sidus } from './client';

/** The device only applies one request per 200 ms; extra ones are dropped. */
export const SIDUS_MIN_INTERVAL_MS = 200;

/** Our FX presets → amaran built-in effects (get_system_effect_list names). */
export const FX_TO_SIDUS_EFFECT: Record<string, string> = {
  'fx-cop': 'cop_car',
  'fx-fire': 'fire',
  'fx-paparazzi': 'paparazzi',
  'fx-lightning': 'lightning',
  'fx-tv': 'tv',
  'fx-pulse': 'pulsing',
  'fx-strobe': 'strobe',
};
const SIDUS_EFFECT_TO_FX = Object.fromEntries(Object.entries(FX_TO_SIDUS_EFFECT).map(([k, v]) => [v, k]));

/** Best-effort model match from the name shown in amaran Desktop. */
export function guessModel(name: string): FixtureType {
  const n = name.toLowerCase();
  if (n.includes('mc pro')) return 'Aputure MC Pro';
  if (n.includes('nova')) return 'Aputure Nova P300c';
  if (n.includes('1200d')) return 'Aputure 1200d Pro';
  if (n.includes('600d')) return 'Aputure 600d Pro';
  if (/ls\s*300x/.test(n)) return 'Aputure LS 300x';
  if (n.includes('200x')) return 'Amaran 200x S';
  if (n.includes('300c')) return 'Amaran 300c';
  if (n.includes('f22c')) return 'Amaran F22c';
  return 'Sidus Fixture';
}

export function capabilitiesFromConfig(cfg: SidusNodeConfig, effects: string[]): FixtureCapabilities {
  const ext = cfg.cct_extension_support && cfg.cct_extension_enabled;
  return {
    cctMin: ext ? cfg.cct_extension_min : cfg.cct_min,
    cctMax: ext ? cfg.cct_extension_max : cfg.cct_max,
    supportsTint: cfg.gm_support,
    gmMin: cfg.gm_min,
    gmMax: cfg.gm_max,
    hsi: cfg.hsi_support,
    rgb: cfg.rgb_support,
    effects,
  };
}

export interface SidusImport {
  node: SidusNode;
  model: FixtureType;
  capabilities: FixtureCapabilities;
}

/** List fixtures in amaran Desktop with their capabilities. */
export async function listSidusFixtures(onFound: (f: SidusImport) => void, signal?: AbortSignal) {
  const nodes = await sidus.request<SidusNode[]>('get_fixture_list');
  for (const node of nodes ?? []) {
    if (signal?.aborted) return;
    const cfg = await sidus.request<SidusNodeConfig>('get_node_config', node.node_id);
    const effects = await sidus.request<string[]>('get_system_effect_list', node.node_id).catch(() => [] as string[]);
    onFound({ node, model: guessModel(node.name), capabilities: capabilitiesFromConfig(cfg, effects ?? []) });
  }
}

// ---------------------------------------------------------------------------
// Desired state → commands

type Mode = 'cct' | 'hsi' | 'rgb' | 'effect';

interface CommandState {
  sleep: boolean;
  mode: Mode;
  intensity: number; // 0..1000
  cct: number;
  gm: number | null; // 0..200, 100 = neutral
  hue: number;
  sat: number;
  r: number;
  g: number;
  b: number;
  effect: string | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function desiredState(f: Fixture, outputLevel: number): CommandState {
  const caps = f.capabilities;
  const effectName = f.activeFxId ? FX_TO_SIDUS_EFFECT[f.activeFxId] : undefined;
  const effect = effectName && caps?.effects.includes(effectName) ? effectName : null;
  const base: CommandState = {
    sleep: !f.power,
    mode: 'cct',
    intensity: Math.round(clamp(outputLevel, 0, 100) * 10),
    cct: Math.round(clamp(f.cct, caps?.cctMin ?? 1800, caps?.cctMax ?? 20000)),
    gm: caps?.supportsTint ? Math.round(clamp(100 + f.tint * 100, caps.gmMin, caps.gmMax)) : null,
    hue: Math.round(f.hue),
    sat: Math.round(f.saturation),
    r: 255,
    g: 255,
    b: 255,
    effect,
  };
  if (effect) return { ...base, mode: 'effect' };

  const color = caps ? caps.hsi || caps.rgb : true;
  if (!color) return base;

  let rgb: { r: number; g: number; b: number } | null = null;
  if (f.colorMode === 'HSI') return { ...base, mode: caps?.hsi === false ? 'rgb' : 'hsi', ...hsiToRgbIfNeeded(f, caps) };
  if (f.colorMode === 'XY') rgb = xyToRgb(f.xy ?? D65);
  if (f.colorMode === 'GEL') {
    const gel = GEL_PRESETS.find((g) => `${g.code} ${g.name}` === f.gelName);
    if (gel) rgb = hexToRgb(gel.hex);
  }
  if (!rgb) return base;
  if (caps?.rgb !== false) return { ...base, mode: 'rgb', ...rgb };
  const hs = rgbToHueSat(rgb);
  return { ...base, mode: 'hsi', hue: hs.hue, sat: hs.saturation };
}

function hsiToRgbIfNeeded(f: Fixture, caps?: FixtureCapabilities) {
  if (caps?.hsi !== false) return {};
  // HSV → RGB for fixtures that only take RGB
  const h = f.hue / 60;
  const s = f.saturation / 100;
  const c = s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  const m = 1 - c;
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

interface NodeState {
  desired: CommandState | null;
  sent: Partial<CommandState>;
  lastSentAt: number;
  timer: number | null;
  inFlight: boolean;
}

const colorFields: Record<Exclude<Mode, 'effect'>, (keyof CommandState)[]> = {
  cct: ['cct', 'gm', 'intensity'],
  hsi: ['hue', 'sat', 'intensity'],
  rgb: ['r', 'g', 'b', 'intensity'],
};

/** Pick the single most important request needed to move `sent` → `want`. */
function nextCommand(want: CommandState, sent: Partial<CommandState>):
  | { action: string; args?: Record<string, unknown>; covers: Partial<CommandState> }
  | null {
  if (want.sleep !== sent.sleep) {
    return { action: 'set_sleep', args: { sleep: want.sleep }, covers: { sleep: want.sleep } };
  }
  if (want.sleep) return null; // asleep: nothing else matters

  if (want.mode === 'effect') {
    if (sent.mode !== 'effect' || sent.effect !== want.effect) {
      return { action: 'set_system_effect', args: { effect_type: want.effect }, covers: { mode: 'effect', effect: want.effect } };
    }
    return null; // the fixture runs the effect itself
  }

  const fields = colorFields[want.mode];
  const modeChanged = sent.mode !== want.mode;
  const colorChanged = fields.some((k) => k !== 'intensity' && want[k] !== sent[k]);
  if (modeChanged || colorChanged) {
    const covers: Partial<CommandState> = { mode: want.mode, effect: null };
    fields.forEach((k) => ((covers as Record<string, unknown>)[k] = want[k]));
    if (want.mode === 'cct') {
      const args: Record<string, unknown> = { cct: want.cct, intensity: want.intensity };
      if (want.gm !== null) args.gm = want.gm;
      return { action: 'set_cct', args, covers };
    }
    if (want.mode === 'hsi') return { action: 'set_hsi', args: { hue: want.hue, sat: want.sat, intensity: want.intensity }, covers };
    return { action: 'set_rgb', args: { r: want.r, g: want.g, b: want.b, intensity: want.intensity }, covers };
  }
  if (want.intensity !== sent.intensity) {
    return { action: 'set_intensity', args: { intensity: want.intensity }, covers: { intensity: want.intensity } };
  }
  return null;
}

class SidusSender {
  private nodes = new Map<string, NodeState>();
  errors = new Map<string, string>();

  private node(id: string): NodeState {
    let n = this.nodes.get(id);
    if (!n) {
      n = { desired: null, sent: {}, lastSentAt: 0, timer: null, inFlight: false };
      this.nodes.set(id, n);
    }
    return n;
  }

  queue(nodeId: string, desired: CommandState) {
    const n = this.node(nodeId);
    n.desired = desired;
    this.schedule(nodeId, n);
  }

  /** Something outside the app changed the device: record it so we don't echo it back. */
  noteRemote(nodeId: string, values: Partial<CommandState>) {
    const n = this.node(nodeId);
    n.sent = { ...n.sent, ...values };
  }

  /** Forget what we think the device has (e.g. after a reconnect) so state is re-sent. */
  resync(nodeId?: string) {
    if (nodeId) this.node(nodeId).sent = {};
    else this.nodes.forEach((n) => (n.sent = {}));
  }

  forget(nodeId: string) {
    const n = this.nodes.get(nodeId);
    if (n?.timer) window.clearTimeout(n.timer);
    this.nodes.delete(nodeId);
  }

  private schedule(nodeId: string, n: NodeState) {
    if (n.timer !== null || n.inFlight) return;
    const wait = Math.max(0, n.lastSentAt + SIDUS_MIN_INTERVAL_MS - performance.now());
    n.timer = window.setTimeout(() => {
      n.timer = null;
      this.flush(nodeId, n);
    }, wait);
  }

  private async flush(nodeId: string, n: NodeState) {
    if (!n.desired || sidus.status !== 'connected') return;
    const cmd = nextCommand(n.desired, n.sent);
    if (!cmd) return;
    n.inFlight = true;
    n.lastSentAt = performance.now();
    const before = n.sent;
    n.sent = { ...n.sent, ...cmd.covers };
    try {
      await sidus.request(cmd.action, nodeId, cmd.args);
      this.errors.delete(nodeId);
    } catch (e) {
      this.errors.set(nodeId, (e as Error).message);
      if (e instanceof SidusError && e.code === 3004 && n.desired?.mode === 'effect') {
        // Effect not supported after all: fall back to plain colour.
        n.desired = { ...n.desired, mode: 'cct', effect: null };
      }
      n.sent = before;
      console.warn(`[amaran] ${cmd.action} on ${nodeId} failed:`, (e as Error).message);
    } finally {
      n.inFlight = false;
    }
    // More to do (e.g. wake first, then colour)? Next slot in 200 ms.
    if (n.desired && nextCommand(n.desired, n.sent)) this.schedule(nodeId, n);
  }
}

export const sidusSender = new SidusSender();

// ---------------------------------------------------------------------------
// Events from amaran Desktop → fixture updates

const num = (v: unknown, key: string): number | undefined => {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && typeof (v as Record<string, unknown>)[key] === 'number') return (v as Record<string, number>)[key];
  return undefined;
};

export interface RemoteChange {
  nodeId: string;
  /** Output intensity 0-100 the device now has, if it changed. */
  outputLevel?: number;
  updates: Partial<Fixture>;
}

/** Translate an OpenAPI event into fixture changes. Returns null for our own echoes. */
export function translateEvent(ev: SidusEvent): RemoteChange | null {
  if (!ev.node_id || ev.cause_by === sidus.clientId) return null;
  const d = ev.data as Record<string, unknown> | number | boolean | string | undefined;
  const updates: Partial<Fixture> = {};
  const remote: Partial<CommandState> = {};
  const intensity = num(d, 'intensity');
  if (intensity !== undefined && ev.event !== 'sleep_changed') remote.intensity = intensity;

  switch (ev.event) {
    case 'sleep_changed':
      if (typeof d === 'boolean') {
        updates.power = !d;
        remote.sleep = d;
      }
      break;
    case 'cct_changed': {
      const cct = num(d, 'cct');
      const gm = num(d, 'gm');
      updates.colorMode = 'CCT';
      updates.activeFxId = undefined;
      remote.mode = 'cct';
      remote.effect = null;
      if (cct !== undefined) { updates.cct = cct; remote.cct = cct; }
      if (gm !== undefined) { updates.tint = Math.round((gm - 100)) / 100; remote.gm = gm; }
      break;
    }
    case 'hsi_changed': {
      const hue = num(d, 'hue');
      const sat = num(d, 'sat');
      updates.colorMode = 'HSI';
      updates.activeFxId = undefined;
      remote.mode = 'hsi';
      remote.effect = null;
      if (hue !== undefined) { updates.hue = hue; remote.hue = hue; }
      if (sat !== undefined) { updates.saturation = sat; remote.sat = sat; }
      break;
    }
    case 'rgb_changed': {
      const r = num(d, 'r') ?? 255;
      const g = num(d, 'g') ?? 255;
      const b = num(d, 'b') ?? 255;
      const hs = rgbToHueSat({ r, g, b });
      updates.colorMode = 'HSI';
      updates.hue = hs.hue;
      updates.saturation = hs.saturation;
      updates.activeFxId = undefined;
      Object.assign(remote, { mode: 'rgb', r, g, b, effect: null });
      break;
    }
    case 'effect_changed': {
      const name = typeof d === 'string' ? d : typeof (d as Record<string, unknown>)?.effect_type === 'string' ? String((d as Record<string, unknown>).effect_type) : '';
      updates.activeFxId = SIDUS_EFFECT_TO_FX[name];
      if (name) Object.assign(remote, { mode: 'effect', effect: name });
      break;
    }
  }
  sidusSender.noteRemote(ev.node_id, remote);
  return { nodeId: ev.node_id, outputLevel: remote.intensity !== undefined ? remote.intensity / 10 : undefined, updates };
}
