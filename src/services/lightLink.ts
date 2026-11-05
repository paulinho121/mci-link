import { Fixture, FixtureCapabilities, FixtureType, LinkTransport } from '../types/cine';
import { FIXTURE_PROFILES, profileFor, DmxChannelFn } from '../data/fixtureProfiles';
import { sidus } from './sidus/client';
import { desiredState, listSidusFixtures, sidusSender } from './sidus/driver';
import { D65, rgbToHueSat, xyToRgb } from '../utils/color';

/**
 * Light link layer.
 *
 * Every transport implements the same `LightLinkDriver` contract so the UI
 * never cares how a fixture is reached. Today all drivers are SIMULATED.
 * Real drivers plug in here later:
 *  - BLE:    Web Bluetooth (Chrome/Edge only). Aputure/Amaran use the
 *            proprietary Sidus Link protocol, which needs vendor docs/SDK.
 *  - ARTNET / SACN: browsers cannot send UDP, so a small local bridge
 *            (Node/Express + WebSocket) will receive frames and send them.
 *  - CRMX:   a LumenRadio TX fed by Art-Net/sACN, so it reuses that bridge.
 */

export interface DiscoveredDevice {
  deviceId: string;
  transport: LinkTransport;
  model: FixtureType;
  deviceName: string;
  rssi: number;
  firmware: string;
  nodeAddress?: string;
  crmxChannel?: number;
  universe?: number;
  startAddress?: number;
  battery?: number;
  /** Reported by the device (amaran Desktop get_node_config). */
  capabilities?: FixtureCapabilities;
}

export interface LightLinkDriver {
  transport: LinkTransport;
  label: string;
  description: string;
  simulated: boolean;
  /** Streams devices to `onFound` until the scan ends or `signal` aborts. */
  discover(onFound: (d: DiscoveredDevice) => void, signal: AbortSignal): Promise<void>;
  connect(device: DiscoveredDevice): Promise<void>;
  disconnect(deviceId: string): Promise<void>;
  identify(deviceId: string): Promise<void>;
  /** Push the fixture's current output state to the device. */
  send(fixture: Fixture, outputLevel: number): void;
}

export const TRANSPORT_LABELS: Record<LinkTransport, string> = {
  SIDUS: 'AMARAN',
  BLE: 'BLE',
  ARTNET: 'ART-NET',
  SACN: 'sACN',
  CRMX: 'CRMX',
};

export const isWebBluetoothAvailable = (): boolean =>
  typeof navigator !== 'undefined' && 'bluetooth' in navigator;

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = window.setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(t);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });

type SimTransport = Exclude<LinkTransport, 'SIDUS'>;

// Simulated devices "in the room", per transport.
const SIMULATED_DEVICES: Record<SimTransport, Omit<DiscoveredDevice, 'transport'>[]> = {
  BLE: [
    { deviceId: 'ble-a1f3', model: 'Aputure Nova P300c', deviceName: 'NOVA P300c-A1F3', rssi: -48, firmware: '1.4.2' },
    { deviceId: 'ble-77c0', model: 'Amaran 200x S', deviceName: 'amaran 200x S-77C0', rssi: -55, firmware: '2.0.1' },
    { deviceId: 'ble-0b9e', model: 'Aputure MC Pro', deviceName: 'MC Pro-0B9E', rssi: -61, firmware: '1.1.0', battery: 82 },
    { deviceId: 'ble-0b9f', model: 'Aputure MC Pro', deviceName: 'MC Pro-0B9F', rssi: -63, firmware: '1.1.0', battery: 64 },
    { deviceId: 'ble-5d21', model: 'Amaran 300c', deviceName: 'amaran 300c-5D21', rssi: -70, firmware: '1.3.5' },
    { deviceId: 'ble-e402', model: 'Amaran F22c', deviceName: 'amaran F22c-E402', rssi: -74, firmware: '1.0.8' },
  ],
  ARTNET: [
    { deviceId: 'rdm-1200d-01', model: 'Aputure 1200d Pro', deviceName: '1200d Pro (RDM 0x41500012)', rssi: -40, firmware: '3.2.0', nodeAddress: '192.168.1.150', universe: 2, startAddress: 33 },
    { deviceId: 'rdm-ls300x-01', model: 'Aputure LS 300x', deviceName: 'LS 300x (RDM 0x41500233)', rssi: -40, firmware: '2.5.1', nodeAddress: '192.168.1.150', universe: 2, startAddress: 41 },
  ],
  SACN: [
    { deviceId: 'rdm-p300c-02', model: 'Aputure Nova P300c', deviceName: 'Nova P300c (RDM 0x41500418)', rssi: -40, firmware: '1.4.2', nodeAddress: '239.255.0.4', universe: 4, startAddress: 1 },
  ],
  CRMX: [
    { deviceId: 'crmx-600d-02', model: 'Aputure 600d Pro', deviceName: '600d Pro · CRMX RX', rssi: -52, firmware: '4.1.0', crmxChannel: 18, universe: 3, startAddress: 30 },
    { deviceId: 'crmx-mcpro-03', model: 'Aputure MC Pro', deviceName: 'MC Pro · CRMX RX', rssi: -66, firmware: '1.1.0', crmxChannel: 18, universe: 3, startAddress: 40, battery: 91 },
  ],
};

const DESCRIPTIONS: Record<SimTransport, string> = {
  BLE: 'Direct Bluetooth from this device (Sidus Link compatible fixtures).',
  ARTNET: 'Wi-Fi / Ethernet through an Art-Net node. Fixtures found via RDM.',
  SACN: 'Streaming ACN (E1.31) over the network. Fixtures found via RDM.',
  CRMX: 'LumenRadio wireless DMX through a TX fed by Art-Net / sACN.',
};

function createSimulatedDriver(transport: SimTransport): LightLinkDriver {
  const lastFrames = new Map<string, number[]>();
  return {
    transport,
    label: TRANSPORT_LABELS[transport],
    description: DESCRIPTIONS[transport],
    simulated: true,
    async discover(onFound, signal) {
      for (const d of SIMULATED_DEVICES[transport]) {
        await wait(450 + Math.random() * 500, signal);
        onFound({ ...d, transport, rssi: d.rssi + Math.round((Math.random() - 0.5) * 6) });
      }
      await wait(600, signal);
    },
    async connect() {
      await wait(900 + Math.random() * 600);
    },
    async disconnect() {
      await wait(200);
    },
    async identify() {
      await wait(100);
    },
    send(fixture, outputLevel) {
      lastFrames.set(fixture.id, encodeDmx(fixture, outputLevel));
    },
  };
}

/** Real driver: amaran Desktop official OpenAPI over WebSocket. */
const sidusDriver: LightLinkDriver = {
  transport: 'SIDUS',
  label: 'AMARAN DESKTOP',
  description: 'Official amaran OpenAPI. Talks to amaran Desktop on this PC or the LAN, which controls the lights it has paired.',
  simulated: false,
  async discover(onFound, signal) {
    if (sidus.status !== 'connected') throw new Error('Connect to amaran Desktop first');
    await listSidusFixtures(({ node, model, capabilities }) => {
      onFound({
        deviceId: node.node_id,
        transport: 'SIDUS',
        model,
        deviceName: node.name,
        rssi: 0,
        firmware: '',
        nodeAddress: sidus.currentSettings ? `${sidus.currentSettings.host}:${sidus.currentSettings.port}` : undefined,
        capabilities,
      });
    }, signal);
  },
  async connect(device) {
    if (sidus.status !== 'connected') await sidus.reconnect();
    sidusSender.resync(device.deviceId);
  },
  async disconnect(deviceId) {
    sidusSender.forget(deviceId);
  },
  async identify() {
    // No identify request in the OpenAPI; the app blinks the intensity instead.
  },
  send(fixture, outputLevel) {
    if (fixture.link) sidusSender.queue(fixture.link.deviceId, desiredState(fixture, outputLevel));
  },
};

export const DRIVERS: Record<LinkTransport, LightLinkDriver> = {
  SIDUS: sidusDriver,
  BLE: createSimulatedDriver('BLE'),
  ARTNET: createSimulatedDriver('ARTNET'),
  SACN: createSimulatedDriver('SACN'),
  CRMX: createSimulatedDriver('CRMX'),
};

export const transportsFor = (model: FixtureType) => FIXTURE_PROFILES[model].transports;

const FX_INDEX: Record<string, number> = {
  'fx-cop': 1, 'fx-fire': 2, 'fx-paparazzi': 3, 'fx-lightning': 4, 'fx-tv': 5, 'fx-pulse': 6, 'fx-strobe': 7,
};

const to8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/**
 * Encode a fixture's state into its DMX footprint (values 0-255) using the
 * PROVISIONAL mode in `fixtureProfiles`. `outputLevel` is the final 0-100
 * level after blackout / mute / solo / grand master.
 */
export function encodeDmx(fixture: Fixture, outputLevel: number): number[] {
  const profile = profileFor(fixture);
  const level16 = Math.round((Math.max(0, Math.min(100, outputLevel)) / 100) * 65535);
  const cctSpan = Math.max(1, profile.cctMax - profile.cctMin);
  // Provisional maps have no xy channels: send xy targets as hue/sat.
  const color =
    fixture.colorMode === 'XY'
      ? rgbToHueSat(xyToRgb(fixture.xy ?? D65))
      : { hue: fixture.hue, saturation: fixture.colorMode === 'HSI' ? fixture.saturation : 0 };
  const values: Record<DmxChannelFn, number> = {
    DIMMER: level16 >> 8,
    DIMMER_FINE: level16 & 0xff,
    CCT: to8(((fixture.cct - profile.cctMin) / cctSpan) * 255),
    GM: to8(((fixture.tint + 1) / 2) * 255),
    HUE: to8((color.hue / 360) * 255),
    SAT: to8(color.saturation * 2.55),
    FX: fixture.activeFxId ? to8((FX_INDEX[fixture.activeFxId] ?? 0) * 10) : 0,
  };
  return profile.dmxMode.channels.map((ch) => values[ch]);
}
