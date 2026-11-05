#!/usr/bin/env node
/**
 * Mock amaran Desktop OpenAPI server, for developing the AMARAN DESKTOP
 * driver without the real app, real lights or a Sidus-issued key.
 *
 * Implements the protocol from https://tools.sidus.link/openapi/docs/protocol:
 * token check (AES-256-GCM, 10 s validity), fixture list, node config,
 * sleep / intensity / CCT / HSI / RGB / system effects, and event pushes.
 *
 *   npm run mock:amaran
 *   AMARAN_PORT=12346 MOCK_APP_CHANGES=1 npm run mock:amaran
 *
 * In Cine Light OS: PAIR LIGHT → AMARAN DESKTOP, host 127.0.0.1, port 12345
 * (or AMARAN_PORT), and the DEV key below as the API secret key.
 */
import { WebSocketServer } from 'ws';
import crypto from 'node:crypto';

// DEV-ONLY key for this mock. It is not a Sidus key and unlocks nothing real.
export const DEV_SECRET_KEY = process.env.AMARAN_SECRET || 'ACkQEPbuzKMXIdpgouHKMzXp+n9C8wDDaTHmfDPHh3k=';
const PORT = Number(process.env.AMARAN_PORT || 12345);
const DEVICE_INTERVAL_MS = 200;

const ALL_EFFECTS = [
  'paparazzi', 'fireworks', 'fault_bulb', 'lightning', 'tv', 'pulsing', 'strobe', 'explosion', 'club_lights',
  'candle', 'fire', 'welding', 'cop_car', 'color_chase', 'party_lights',
];

const baseConfig = {
  cct_support: true, cct_extension_support: false, cct_extension_min: 1800, cct_extension_max: 20000,
  cct_extension_enabled: false, gm_support: true, gm_min: 0, gm_max: 200, gm_v2_support: true, advanced_hsi_support: false,
};

const fixtures = [
  { id: '05010-ccdde1', name: 'MC Pro - 1', config: { ...baseConfig, cct_min: 2000, cct_max: 10000, hsi_support: true, rgb_support: true }, effects: ALL_EFFECTS },
  { id: '05020-a1b2c3', name: 'Nova P300c - 3', config: { ...baseConfig, cct_min: 2300, cct_max: 10000, hsi_support: true, rgb_support: true }, effects: ALL_EFFECTS },
  { id: '05005-ccdde2', name: 'amaran 200x S - 2', config: { ...baseConfig, cct_min: 2700, cct_max: 6500, hsi_support: false, rgb_support: false }, effects: ['paparazzi', 'lightning', 'tv', 'pulsing', 'strobe', 'candle', 'fire'] },
].map((f) => ({
  ...f,
  state: { sleep: false, intensity: 500, mode: 'cct', cct: 5600, gm: 100, hue: 0, sat: 0, r: 255, g: 255, b: 255, effect: null },
  lastSetAt: 0,
}));

const ALL_ID = '00000000000000000000000000000000';

const errors = {
  1001: 'Invalid Request', 2001: 'Invalid Token', 2002: 'Token Expired', 3001: 'Device or Group Not Found',
  3002: 'Preset Not Found', 3003: 'Quickshot Not Found', 3004: 'Device or Group Does Not Support the Effect', 9001: 'Unknown Error',
};

class ApiError extends Error {
  constructor(code) {
    super(errors[code]);
    this.code = code;
  }
}

function checkToken(token) {
  try {
    const raw = Buffer.from(String(token), 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ct = raw.subarray(28);
    const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(DEV_SECRET_KEY, 'base64'), iv);
    d.setAuthTag(tag);
    const ts = Number(Buffer.concat([d.update(ct), d.final()]).toString('utf8'));
    if (!Number.isInteger(ts)) throw new ApiError(2001);
    if (Math.abs(Date.now() / 1000 - ts) > 10) throw new ApiError(2002);
  } catch (e) {
    throw e instanceof ApiError ? e : new ApiError(2001);
  }
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v))));
const nodesFor = (nodeId) => {
  if (nodeId === ALL_ID) return fixtures;
  const f = fixtures.find((x) => x.id === nodeId);
  if (!f) throw new ApiError(3001);
  return [f];
};
const nodeList = () => fixtures.map((f) => ({ id: f.id, name: f.name, node_id: f.id }));

const cctData = (s, c) => ({ cct: s.cct, intensity: s.intensity, ...(c.gm_support ? { gm: s.gm } : {}) });
const hsiData = (s) => ({ hue: s.hue, sat: s.sat, intensity: s.intensity });
const rgbData = (s) => ({ r: s.r, g: s.g, b: s.b, intensity: s.intensity });

const wss = new WebSocketServer({ host: '0.0.0.0', port: PORT });

function broadcast(event, nodeId, data, causeBy) {
  const msg = JSON.stringify({ version: 2, type: 'event', event, cause_by: causeBy, node_id: nodeId, data });
  wss.clients.forEach((c) => c.readyState === 1 && c.send(msg));
}

/** Apply a "set" to each target node; returns the data of the first one. */
function applyToNodes(nodeId, causeBy, label, fn) {
  let first;
  for (const f of nodesFor(nodeId)) {
    const now = Date.now();
    if (now - f.lastSetAt < DEVICE_INTERVAL_MS) {
      console.warn(`  ! ${f.name}: ${label} ${now - f.lastSetAt} ms after the previous one (device would drop one)`);
    }
    f.lastSetAt = now;
    const out = fn(f, f.state, f.config);
    if (first === undefined) first = out;
  }
  return first;
}

function handle(req) {
  const { action, node_id: nodeId, args = {} } = req;
  const causeBy = req.client_id ?? 'openapi';
  switch (action) {
    case 'get_protocol_versions': return [2];
    case 'get_fixture_list': return nodeList();
    case 'get_device_list': return [...nodeList(), { id: ALL_ID, name: 'ALL', node_id: ALL_ID }];
    case 'get_scene_list': return [{ id: 'scene-mock-01', name: 'Mock Scene', fixtures: nodeList(), groups: [] }];
    case 'get_quickshot_list': return [];
    case 'get_preset_list': return { cct: [], color: [], effect: [] };
    case 'get_node_config': return nodesFor(nodeId)[0].config;
    case 'get_system_effect_list': return nodesFor(nodeId)[0].effects;
    case 'get_sleep': return nodesFor(nodeId)[0].state.sleep;
    case 'get_intensity': return nodesFor(nodeId)[0].state.intensity;
    case 'get_cct': { const f = nodesFor(nodeId)[0]; return cctData(f.state, f.config); }
    case 'get_hsi': return hsiData(nodesFor(nodeId)[0].state);
    case 'get_rgb': return rgbData(nodesFor(nodeId)[0].state);

    case 'set_sleep':
    case 'toggle_sleep':
      return applyToNodes(nodeId, causeBy, action, (f, s) => {
        s.sleep = action === 'toggle_sleep' ? !s.sleep : !!args.sleep;
        broadcast('sleep_changed', f.id, s.sleep, causeBy);
        return s.sleep;
      });
    case 'set_intensity':
    case 'increase_intensity':
      return applyToNodes(nodeId, causeBy, action, (f, s) => {
        s.intensity = clamp(action === 'increase_intensity' ? s.intensity + Number(args.delta) : args.intensity, 0, 1000);
        broadcast('intensity_changed', f.id, s.intensity, causeBy);
        return s.intensity;
      });
    case 'set_cct':
    case 'increase_cct':
      return applyToNodes(nodeId, causeBy, action, (f, s, c) => {
        const next = action === 'increase_cct' ? s.cct + Number(args.delta) : args.cct;
        s.cct = clamp(next, c.cct_min, c.cct_max);
        if (args.gm !== undefined && c.gm_support) s.gm = clamp(args.gm, c.gm_min, c.gm_max);
        if (args.intensity !== undefined) s.intensity = clamp(args.intensity, 0, 1000);
        s.mode = 'cct';
        s.effect = null;
        broadcast('cct_changed', f.id, cctData(s, c), causeBy);
        return cctData(s, c);
      });
    case 'set_hsi':
      return applyToNodes(nodeId, causeBy, action, (f, s, c) => {
        if (!c.hsi_support) throw new ApiError(1001);
        s.hue = clamp(args.hue, 0, 360);
        s.sat = clamp(args.sat, 0, 100);
        s.intensity = clamp(args.intensity ?? s.intensity, 0, 1000);
        s.mode = 'hsi';
        s.effect = null;
        broadcast('hsi_changed', f.id, hsiData(s), causeBy);
        return hsiData(s);
      });
    case 'set_rgb':
      return applyToNodes(nodeId, causeBy, action, (f, s, c) => {
        if (!c.rgb_support) throw new ApiError(1001);
        s.r = clamp(args.r, 0, 255);
        s.g = clamp(args.g, 0, 255);
        s.b = clamp(args.b, 0, 255);
        if (args.intensity !== undefined) s.intensity = clamp(args.intensity, 0, 1000);
        s.mode = 'rgb';
        s.effect = null;
        broadcast('rgb_changed', f.id, rgbData(s), causeBy);
        return rgbData(s);
      });
    case 'set_system_effect':
      return applyToNodes(nodeId, causeBy, action, (f, s) => {
        if (!f.effects.includes(args.effect_type)) throw new ApiError(3004);
        s.effect = args.effect_type;
        s.mode = 'effect';
        broadcast('effect_changed', f.id, s.effect, causeBy);
        return s.effect;
      });
    default:
      throw new ApiError(1001);
  }
}

wss.on('connection', (ws, req) => {
  console.log(`client connected from ${req.socket.remoteAddress}`);
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    const base = {
      version: msg.version ?? 2, type: 'response', client_id: msg.client_id, request_id: msg.request_id,
      node_id: msg.node_id, action: msg.action, user_data: msg.user_data,
    };
    try {
      if (msg.type !== 'request' || !msg.action) throw new ApiError(1001);
      checkToken(msg.token);
      const data = handle(msg);
      const name = fixtures.find((f) => f.id === msg.node_id)?.name ?? msg.node_id ?? '';
      if (!String(msg.action).startsWith('get_')) console.log(`${msg.action} ${name} ${JSON.stringify(msg.args ?? {})}`);
      ws.send(JSON.stringify({ code: 0, message: 'ok', ...base, data }));
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 9001;
      console.warn(`  ✗ ${msg.action}: ${code} ${errors[code]}`);
      ws.send(JSON.stringify({ code, message: errors[code], ...base }));
    }
  });
});

wss.on('listening', () => {
  console.log(`Mock amaran Desktop OpenAPI on ws://0.0.0.0:${PORT}`);
  console.log(`Fixtures: ${fixtures.map((f) => f.name).join(', ')}`);
  console.log(`Use the DEV key from scripts/mock-amaran-desktop.mjs (or AMARAN_SECRET) in the app.`);
});
wss.on('error', (e) => {
  console.error(`Mock server error: ${e.message}`);
  process.exit(1);
});

// Optional: pretend someone changes MC Pro in amaran Desktop every 12 s.
if (process.env.MOCK_APP_CHANGES) {
  setInterval(() => {
    const f = fixtures[0];
    f.state.intensity = 100 + Math.round(Math.random() * 800);
    console.log(`(app) ${f.name} intensity → ${f.state.intensity}`);
    broadcast('intensity_changed', f.id, f.state.intensity, 'app');
  }, 12000);
}
