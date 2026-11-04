export type FixtureType = 
  | 'ARRI SkyPanel S60-C'
  | 'Creamsource Vortex8'
  | 'Aputure 600d Pro'
  | 'Astera Titan Tube'
  | 'ARRI Orbiter'
  | 'Litepanels Gemini 2x1'
  | 'Nanlux Evoke 1200'
  | 'Kino Flo Celeb 450Q';

export interface Fixture {
  id: string;
  name: string;
  tag: string; // e.g. "KEY-01", "FILL-02", "RIM-01"
  type: FixtureType;
  universe: number; // 1 - 4
  startAddress: number; // 1 - 512
  channelCount: number; // e.g. 8
  
  // Power & State
  power: boolean;
  dimmer: number; // 0.0 - 100.0%
  cct: number; // 2000K - 10000K
  tint: number; // -1.00 (Magenta) to +1.00 (Green)
  colorMode: 'CCT' | 'HSI' | 'GEL' | 'FX';
  
  // Color data for HSI/GEL
  hue: number; // 0 - 360
  saturation: number; // 0 - 100
  gelName?: string;
  
  // Physical / Rig placement
  x: number; // Stage coordinate X (0 - 1000)
  y: number; // Stage coordinate Y (0 - 1000)
  rotation: number; // Pan angle 0 - 360 deg
  tilt: number; // Tilt angle -90 to +90 deg
  beamAngle: number; // 15 - 90 deg
  
  // Hardware status
  temperature: number; // deg C
  rssi: number; // -30 to -90 dBm
  battery?: number; // 0 - 100% (if applicable)
  group: number; // 1, 2, 3, etc.
  
  // Solo & Mute
  solo: boolean;
  muted: boolean;
  
  // Active FX assignment
  activeFxId?: string;
}

export interface GelPreset {
  id: string;
  code: string;
  name: string;
  category: 'CTB' | 'CTO' | 'Diffusion' | 'Color Effect' | 'Cosmetic';
  hex: string;
  cctShift?: string;
  transmission: number; // %
}

export interface Cue {
  id: string;
  number: string; // e.g. "1.0", "1.5"
  name: string;
  scene: string;
  fadeTime: number; // seconds
  fixturesSnapshot: Record<string, {
    dimmer: number;
    cct: number;
    tint: number;
    power: boolean;
    hue?: number;
    saturation?: number;
    activeFxId?: string;
  }>;
  notes: string;
}

export type FxType = 
  | 'COP_CAR'
  | 'CAMPFIRE'
  | 'PAPARAZZI'
  | 'LIGHTNING'
  | 'TV_FLICKER'
  | 'PULSE'
  | 'STROBE';

export interface FxPreset {
  id: string;
  name: string;
  type: FxType;
  frequency: number; // 0.5Hz - 30Hz
  depth: number; // 10% - 100%
  description: string;
}

export interface DmxUniverseState {
  universeNumber: number;
  channels: number[]; // 512 channels, 0-255
}
