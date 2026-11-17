import type { Fixture } from '../types/cine';
import type { DmxMode } from './fixtureProfiles';
import { GEL_PRESETS } from './initialData';
import { D65, rgbToHueSat, xyToRgb } from '../utils/color';

/**
 * Creamsource Vortex (Vortex4 / Vortex8 / Vortex24), official DMX table:
 * "Vortex DMX Tables" V3.1 rev B (CreamOS 3.1+),
 * Mode 8: 16-bit – CCT and Hue/Saturation, 14 slots.
 *
 *  1-2   Master Level      0…65535 → 0…100 %
 *  3-4   CCT               0…65535 → 2200…15000 K
 *  5-6   Green/Magenta     0…5000 neutral, 5001…35267 = −100…−1 (magenta),
 *                          35268 neutral, 35269…65535 = +1…+100 green
 *  7-8   CCT-Colour Xfade  0…65535 → 0…100 % (0 = pure CCT, 100 = colour)
 *  9-10  Hue               0…65535 → 0…360°
 *  11-12 Saturation        0…65535 → 0…100 %
 *  13    Fan Mode          0…9 = Auto
 *  14    Control Channel   0 = no action
 *
 * The table gives the CCT end points only; values in between are assumed
 * linear in kelvin.
 */
export const VORTEX_CCT_MIN = 2200;
export const VORTEX_CCT_MAX = 15000;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const u16 = (v: number) => Math.round(clamp(v, 0, 1) * 65535);
const split = (v: number) => [(v >> 8) & 0xff, v & 0xff];

/** tint −1…+1 (negative = magenta) → Vortex 16-bit G/M value. */
export function vortexGm16(tint: number): number {
  const pct = Math.round(clamp(tint, -1, 1) * 100);
  if (pct === 0) return 35268;
  const step = (35267 - 5001) / 99;
  return pct < 0 ? Math.round(5001 + (100 + pct) * step) : Math.round(35269 + (pct - 1) * step);
}

function colourOf(f: Fixture): { hue: number; sat: number } | null {
  if (f.colorMode === 'HSI') return { hue: f.hue, sat: f.saturation };
  if (f.colorMode === 'XY') {
    const hs = rgbToHueSat(xyToRgb(f.xy ?? D65));
    return { hue: hs.hue, sat: hs.saturation };
  }
  if (f.colorMode === 'GEL') {
    const gel = GEL_PRESETS.find((g) => `${g.code} ${g.name}` === f.gelName);
    if (gel) {
      const n = parseInt(gel.hex.replace('#', ''), 16);
      const hs = rgbToHueSat({ r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 });
      return { hue: hs.hue, sat: hs.saturation };
    }
  }
  return null;
}

export function encodeVortexMode8(f: Fixture, outputLevel: number): number[] {
  const level = u16(outputLevel / 100);
  const cct = u16((clamp(f.cct, VORTEX_CCT_MIN, VORTEX_CCT_MAX) - VORTEX_CCT_MIN) / (VORTEX_CCT_MAX - VORTEX_CCT_MIN));
  const colour = colourOf(f);
  return [
    ...split(level),
    ...split(cct),
    ...split(vortexGm16(f.tint)),
    ...split(colour ? 65535 : 0),
    ...split(u16((colour?.hue ?? 0) / 360)),
    ...split(u16((colour?.sat ?? 0) / 100)),
    0, // fan: auto
    0, // control channel: no action
  ];
}

export const VORTEX_MODE_8: DmxMode = {
  name: 'Mode 8 · 16-bit CCT & Hue/Sat',
  channels: ['DIMMER', 'DIMMER_FINE', 'CCT', 'CCT_FINE', 'GM', 'GM_FINE', 'XFADE', 'XFADE_FINE', 'HUE', 'HUE_FINE', 'SAT', 'SAT_FINE', 'FAN', 'CONTROL'],
  encode: encodeVortexMode8,
};
