import { Fixture, FixtureType, LinkTransport } from '../types/cine';

/**
 * Per-model capabilities used by pairing and the individual control panel.
 *
 * NOTE: ranges, transports and DMX layouts below are PROVISIONAL placeholders
 * for the UI flow. Before wiring real output, check each model against the
 * manufacturer's spec sheet / DMX profile document (Aputure publishes a DMX
 * profile PDF per fixture and firmware version).
 */
export type ColorCapability = 'DAYLIGHT' | 'BICOLOR' | 'FULL_COLOR';

export type DmxChannelFn =
  | 'DIMMER'
  | 'DIMMER_FINE'
  | 'CCT'
  | 'GM'
  | 'HUE'
  | 'SAT'
  | 'FX';

export interface DmxMode {
  name: string;
  channels: DmxChannelFn[];
}

export interface FixtureProfile {
  model: FixtureType;
  brand: 'Aputure' | 'Amaran' | 'ARRI' | 'Creamsource' | 'Astera' | 'Litepanels' | 'Nanlux' | 'Kino Flo';
  capability: ColorCapability;
  cctMin: number;
  cctMax: number;
  supportsTint: boolean;
  transports: LinkTransport[];
  dmxMode: DmxMode;
  battery?: boolean;
}

const MODE_DAYLIGHT: DmxMode = { name: 'Dimmer 16-bit', channels: ['DIMMER', 'DIMMER_FINE', 'FX'] };
const MODE_BICOLOR: DmxMode = { name: 'CCT 8-bit', channels: ['DIMMER', 'CCT', 'GM', 'FX'] };
const MODE_FULL: DmxMode = {
  name: 'CCT & HSI 16-bit',
  channels: ['DIMMER', 'DIMMER_FINE', 'CCT', 'GM', 'HUE', 'SAT', 'FX'],
};

const ALL_LINKS: LinkTransport[] = ['SIDUS', 'BLE', 'ARTNET', 'SACN', 'CRMX'];
const DMX_LINKS: LinkTransport[] = ['ARTNET', 'SACN', 'CRMX'];

export const FIXTURE_PROFILES: Record<FixtureType, FixtureProfile> = {
  // --- Aputure / Amaran ---
  'Aputure 600d Pro': { model: 'Aputure 600d Pro', brand: 'Aputure', capability: 'DAYLIGHT', cctMin: 5600, cctMax: 5600, supportsTint: false, transports: ALL_LINKS, dmxMode: MODE_DAYLIGHT },
  'Aputure 1200d Pro': { model: 'Aputure 1200d Pro', brand: 'Aputure', capability: 'DAYLIGHT', cctMin: 5600, cctMax: 5600, supportsTint: false, transports: ALL_LINKS, dmxMode: MODE_DAYLIGHT },
  'Aputure Nova P300c': { model: 'Aputure Nova P300c', brand: 'Aputure', capability: 'FULL_COLOR', cctMin: 2300, cctMax: 10000, supportsTint: true, transports: ALL_LINKS, dmxMode: MODE_FULL },
  'Aputure LS 300x': { model: 'Aputure LS 300x', brand: 'Aputure', capability: 'BICOLOR', cctMin: 2700, cctMax: 6500, supportsTint: true, transports: ['BLE', 'ARTNET', 'SACN'], dmxMode: MODE_BICOLOR },
  'Aputure MC Pro': { model: 'Aputure MC Pro', brand: 'Aputure', capability: 'FULL_COLOR', cctMin: 2000, cctMax: 10000, supportsTint: true, transports: ['BLE', 'CRMX'], dmxMode: MODE_FULL, battery: true },
  'Amaran 200x S': { model: 'Amaran 200x S', brand: 'Amaran', capability: 'BICOLOR', cctMin: 2700, cctMax: 6500, supportsTint: true, transports: ['BLE'], dmxMode: MODE_BICOLOR },
  'Amaran 300c': { model: 'Amaran 300c', brand: 'Amaran', capability: 'FULL_COLOR', cctMin: 2500, cctMax: 7500, supportsTint: true, transports: ['BLE'], dmxMode: MODE_FULL },
  'Amaran F22c': { model: 'Amaran F22c', brand: 'Amaran', capability: 'FULL_COLOR', cctMin: 2500, cctMax: 7500, supportsTint: true, transports: ['BLE'], dmxMode: MODE_FULL },

  'Sidus Fixture': { model: 'Sidus Fixture', brand: 'Aputure', capability: 'FULL_COLOR', cctMin: 2000, cctMax: 10000, supportsTint: true, transports: ['SIDUS'], dmxMode: MODE_FULL },

  // --- Existing demo rig ---
  'ARRI SkyPanel S60-C': { model: 'ARRI SkyPanel S60-C', brand: 'ARRI', capability: 'FULL_COLOR', cctMin: 2800, cctMax: 10000, supportsTint: true, transports: DMX_LINKS, dmxMode: MODE_FULL },
  'ARRI Orbiter': { model: 'ARRI Orbiter', brand: 'ARRI', capability: 'FULL_COLOR', cctMin: 2000, cctMax: 10000, supportsTint: true, transports: DMX_LINKS, dmxMode: MODE_FULL },
  'Creamsource Vortex8': { model: 'Creamsource Vortex8', brand: 'Creamsource', capability: 'FULL_COLOR', cctMin: 2000, cctMax: 10000, supportsTint: true, transports: DMX_LINKS, dmxMode: MODE_FULL },
  'Astera Titan Tube': { model: 'Astera Titan Tube', brand: 'Astera', capability: 'FULL_COLOR', cctMin: 2000, cctMax: 10000, supportsTint: true, transports: DMX_LINKS, dmxMode: MODE_FULL, battery: true },
  'Litepanels Gemini 2x1': { model: 'Litepanels Gemini 2x1', brand: 'Litepanels', capability: 'FULL_COLOR', cctMin: 2200, cctMax: 10000, supportsTint: true, transports: DMX_LINKS, dmxMode: MODE_FULL },
  'Nanlux Evoke 1200': { model: 'Nanlux Evoke 1200', brand: 'Nanlux', capability: 'BICOLOR', cctMin: 2700, cctMax: 6500, supportsTint: true, transports: DMX_LINKS, dmxMode: MODE_BICOLOR },
  'Kino Flo Celeb 450Q': { model: 'Kino Flo Celeb 450Q', brand: 'Kino Flo', capability: 'FULL_COLOR', cctMin: 2500, cctMax: 9900, supportsTint: true, transports: DMX_LINKS, dmxMode: MODE_FULL },
};

export const getProfile = (model: FixtureType): FixtureProfile => FIXTURE_PROFILES[model];

/**
 * Profile for a specific fixture: the model defaults, overridden by what the
 * device itself reported (amaran Desktop `get_node_config`) when available.
 */
export function profileFor(fixture: Fixture): FixtureProfile {
  const base = FIXTURE_PROFILES[fixture.type];
  const caps = fixture.capabilities;
  if (!caps) return base;
  const capability: ColorCapability = caps.hsi || caps.rgb ? 'FULL_COLOR' : caps.cctMin === caps.cctMax ? 'DAYLIGHT' : 'BICOLOR';
  return { ...base, capability, cctMin: caps.cctMin, cctMax: caps.cctMax, supportsTint: caps.supportsTint };
}
