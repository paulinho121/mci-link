import type { Fixture } from '../types/cine';
import type { DmxMode } from './fixtureProfiles';

/**
 * Aputure LS 600d Pro, official DMX table (Aputure Help Center,
 * "[LS 600d Pro] Controlling Device via DMX", 5 DMX channels):
 *
 *  1  Dimmer          0…255 → 0…100 %
 *  2  Mode selection  0…127 Manual, 128…255 FX
 *  3  FX control      0-19 Paparazzi, 20-39 Fireworks, 40-59 Faulty Bulb,
 *                     60-79 Lightning, 80-99 TV, 100-119 Pulsing,
 *                     120-139 Strobe, 140-159 Explosion
 *  4  FX frequency    0-19 = 1 … 180-199 = 10
 *  5  FX trigger      (Lightning / Explosion)
 *
 * The console always sends Manual mode: its own FX engine moves the dimmer,
 * so effects behave the same on every light. Channels 3-5 stay at 0.
 */
export function encodeAputure600dPro(f: Fixture, outputLevel: number): number[] {
  const level = Math.round((Math.max(0, Math.min(100, outputLevel)) / 100) * 255);
  return [level, 0, 0, 0, 0];
}

export const APUTURE_600D_PRO_MODE: DmxMode = {
  name: 'DMX 5-ch (Aputure official)',
  channels: ['DIMMER', 'CONTROL', 'FX', 'CONTROL', 'CONTROL'],
  encode: encodeAputure600dPro,
};
