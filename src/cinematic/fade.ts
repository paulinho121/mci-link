import type { Fixture } from '../types/cine';

/**
 * Timed transitions between lighting states.
 *
 * Steps the console state at FADE_STEP_MS; the existing drivers then send
 * only what changed, within each protocol's own rate limit (amaran Desktop
 * 200 ms per light, Bluetooth Mesh 80 ms, CRMX Bluetooth diff writes), so a
 * fade never floods a link: on slow links it simply arrives in coarser steps.
 */

export const FADE_STEP_MS = 50;

type State = Pick<Fixture, 'power' | 'dimmer' | 'cct' | 'tint' | 'colorMode' | 'hue' | 'saturation'>;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpHue = (a: number, b: number, t: number) => {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
};
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** The state at progress t (0…1) between `from` and the target `to`. */
export function fadeFrame(from: State, to: Partial<Fixture>, tRaw: number): Partial<Fixture> {
  const t = ease(Math.max(0, Math.min(1, tRaw)));
  if (tRaw >= 1) return to;

  const out: Partial<Fixture> = {};
  // Intensity: lights that were off start from 0; lights turning off go to 0.
  const startLevel = from.power ? from.dimmer : 0;
  const endLevel = to.power === false ? 0 : (to.dimmer ?? from.dimmer);
  out.power = true;
  out.dimmer = Math.round(lerp(startLevel, endLevel, t) * 10) / 10;
  if (to.power === false && !from.power) return { power: false };

  const toMode = to.colorMode ?? from.colorMode;
  if (toMode === 'CCT' && from.colorMode === 'CCT') {
    out.cct = Math.round(lerp(from.cct, to.cct ?? from.cct, t));
    out.tint = Math.round(lerp(from.tint, to.tint ?? from.tint, t) * 100) / 100;
  } else if (toMode === 'HSI' && from.colorMode === 'HSI') {
    out.hue = Math.round(lerpHue(from.hue, to.hue ?? from.hue, t));
    out.saturation = Math.round(lerp(from.saturation, to.saturation ?? from.saturation, t));
  } else if (toMode === 'HSI') {
    // White → colour: switch to the target hue and bring saturation up.
    out.colorMode = 'HSI';
    out.hue = to.hue ?? from.hue;
    out.saturation = Math.round(lerp(0, to.saturation ?? 0, t));
  } else if (from.colorMode === 'HSI' && toMode === 'CCT') {
    // Colour → white: take saturation down, switch to CCT at the end.
    out.saturation = Math.round(lerp(from.saturation, 0, t));
  } else {
    // Other modes (XY, gel): colour changes at once, intensity fades.
    Object.assign(out, { colorMode: toMode, cct: to.cct, tint: to.tint, hue: to.hue, saturation: to.saturation });
  }
  return out;
}

export interface FadeJob {
  cancel(): void;
}

/**
 * Fade `targets` (fixtureId → final state) over `durationMs`. `apply`
 * receives the per-fixture state for each step. A duration of 0 applies at
 * once. Resolves `onDone` after the final state.
 */
export function runFade(
  fixtures: Fixture[],
  targets: Record<string, Partial<Fixture>>,
  durationMs: number,
  apply: (frame: Record<string, Partial<Fixture>>) => void,
  onDone?: () => void,
): FadeJob {
  const starts = new Map(fixtures.filter((f) => targets[f.id]).map((f) => [f.id, f as State]));
  const finalFrame = () => {
    const out: Record<string, Partial<Fixture>> = {};
    for (const id of starts.keys()) out[id] = targets[id];
    return out;
  };
  if (durationMs <= 0) {
    apply(finalFrame());
    onDone?.();
    return { cancel() {} };
  }
  const t0 = performance.now();
  const timer = window.setInterval(() => {
    const t = (performance.now() - t0) / durationMs;
    if (t >= 1) {
      window.clearInterval(timer);
      apply(finalFrame());
      onDone?.();
      return;
    }
    const frame: Record<string, Partial<Fixture>> = {};
    for (const [id, from] of starts) frame[id] = fadeFrame(from, targets[id], t);
    apply(frame);
  }, FADE_STEP_MS);
  return { cancel: () => window.clearInterval(timer) };
}
