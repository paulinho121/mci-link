import type { Fixture } from '../types/cine';
import { profileFor } from '../data/fixtureProfiles';
import { CinematicLight, CinematicPreset, POSITION_ANGLE, POSITION_LABEL } from './types';

/**
 * Adapts a cinematic preset to the fixtures the user actually has.
 *
 * - Roles are kept in the preset's priority order: with N fixtures, the
 *   first N roles get a fixture each.
 * - Each dropped role (except FILL) is merged into the kept non-key role
 *   whose position is closest, so one physical light covers both.
 * - Colour roles go to full-colour fixtures first; white-only fixtures get
 *   the closest white (CCT / tint) and the result is flagged.
 * - Every value is clamped to the fixture's real range (profileFor).
 * - One plan entry per physical fixture: no duplicate commands.
 */

export interface Assignment {
  fixtureId: string;
  /** Preset light indexes covered by this fixture, primary first. */
  roleIndexes: number[];
  /** e.g. "KEY" or "SIDE + BACK". */
  label: string;
  /** The preset light this fixture reproduces (primary role). */
  light: CinematicLight;
  /** Suggested angle around the subject when it covers several roles. */
  angle: number;
  /** State to apply to the fixture. */
  updates: Partial<Fixture>;
  approximated: boolean;
  notes: string[];
}

export interface AdaptedPlan {
  presetId: string;
  assignments: Assignment[];
  /** Fixtures in the selection that the preset does not need. */
  unusedFixtureIds: string[];
  /** Preset roles no fixture reproduces at all. */
  uncoveredRoles: number[];
  /** True when the result differs from the original scheme. */
  approximation: boolean;
  warnings: string[];
}

/** fixtureId → preset light index to force, or null to leave that fixture untouched. */
export type RoleOverrides = Record<string, number | null>;

export interface AdaptOptions {
  overrides?: RoleOverrides;
  /** Intensity per preset light index, replacing the preset value (0–100). */
  intensities?: Record<number, number>;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const angleDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};
const midAngle = (a: number, b: number) => {
  const d = ((b - a + 540) % 360) - 180;
  return a + d / 2;
};

const isColour = (l: CinematicLight) => l.colorMode === 'HSI' && (l.saturation ?? 0) >= 15;

/** Closest white for a hue on a fixture without colour. */
export function whiteForHue(
  hue: number,
  saturation: number,
  p: { cctMin: number; cctMax: number; supportsTint: boolean },
): { cct: number; tint: number } {
  const h = ((hue % 360) + 360) % 360;
  const s = clamp(saturation, 0, 100) / 100;
  let cct = 5600;
  let tint = 0;
  if (s < 0.15) cct = 5600;
  else if (h <= 70 || h >= 330) cct = Math.round(5600 - s * 3400); // reds, oranges, ambers → warm
  else if (h >= 160 && h <= 260) cct = Math.round(5600 + s * 4400); // cyans, blues → cool
  else if (h > 70 && h < 160) tint = s * 0.6; // greens → plus green
  else tint = -s * 0.6; // purples, magentas → minus green
  return {
    cct: clamp(cct, p.cctMin, p.cctMax),
    tint: p.supportsTint ? Math.round(clamp(tint, -1, 1) * 100) / 100 : 0,
  };
}

function buildUpdates(f: Fixture, light: CinematicLight, intensity: number) {
  const p = profileFor(f);
  const notes: string[] = [];
  let approximated = false;
  const updates: Partial<Fixture> = {
    power: true,
    dimmer: clamp(Math.round(intensity), 0, 100),
    activeFxId: undefined,
    gelName: undefined,
  };

  if (light.colorMode === 'HSI') {
    if (p.capability === 'FULL_COLOR') {
      Object.assign(updates, { colorMode: 'HSI', hue: clamp(light.hue ?? 0, 0, 360), saturation: clamp(light.saturation ?? 0, 0, 100) });
    } else {
      const w = whiteForHue(light.hue ?? 0, light.saturation ?? 0, p);
      Object.assign(updates, { colorMode: 'CCT', cct: w.cct, tint: w.tint });
      approximated = true;
      notes.push(`No colour on this light: closest white ${w.cct}K${w.tint ? ` (tint ${w.tint > 0 ? '+' : ''}${w.tint})` : ''}.`);
    }
  } else {
    const want = light.cct ?? 5600;
    const cct = clamp(want, p.cctMin, p.cctMax);
    if (cct !== want) {
      approximated = true;
      notes.push(`${want}K is outside this light's range: using ${cct}K.`);
    }
    let tint = light.tint ?? 0;
    if (tint !== 0 && !p.supportsTint) {
      approximated = true;
      notes.push('Green/magenta not supported on this light: tint ignored.');
      tint = 0;
    }
    Object.assign(updates, { colorMode: 'CCT', cct, tint });
  }
  if (f.muted) notes.push('This light is muted in the console: unmute it to see the result.');
  return { updates, approximated, notes };
}

export function adaptPreset(preset: CinematicPreset, fixtures: Fixture[], options: AdaptOptions = {}): AdaptedPlan {
  const { overrides = {}, intensities = {} } = options;
  const warnings: string[] = [];
  const lights = preset.lights;
  const intensityOf = (i: number) => intensities[i] ?? lights[i].intensity;

  if (!fixtures.length) {
    return {
      presetId: preset.id,
      assignments: [],
      unusedFixtureIds: [],
      uncoveredRoles: lights.map((_, i) => i),
      approximation: true,
      warnings: ['No lights selected.'],
    };
  }

  // 1. Manual choices first.
  const roleOf = new Map<string, number>();
  const untouched = new Set<string>();
  for (const f of fixtures) {
    if (!(f.id in overrides)) continue;
    const r = overrides[f.id];
    if (r === null) untouched.add(f.id);
    else if (r >= 0 && r < lights.length) roleOf.set(f.id, r);
  }

  // 2. Automatic: remaining fixtures take the remaining roles by priority.
  const free = fixtures.filter((f) => !roleOf.has(f.id) && !untouched.has(f.id));
  const taken = new Set(roleOf.values());
  for (let i = 0; i < lights.length && free.length; i++) {
    if (taken.has(i)) continue;
    const wantsColour = isColour(lights[i]);
    let best = 0;
    let bestScore = -1;
    free.forEach((f, idx) => {
      const p = profileFor(f);
      // Colour roles: colour fixture, else bi-colour (can go warm / cool), else daylight.
      // White roles: leave colour fixtures for later roles; prefer one that reaches the CCT.
      const want = lights[i].cct ?? 5600;
      const score = wantsColour
        ? { FULL_COLOR: 3, BICOLOR: 1, DAYLIGHT: 0 }[p.capability]
        : (p.capability === 'FULL_COLOR' ? 0 : 2) + (want >= p.cctMin && want <= p.cctMax ? 1 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = idx;
      }
    });
    const [f] = free.splice(best, 1);
    roleOf.set(f.id, i);
    taken.add(i);
  }
  const unusedFixtureIds = [...free.map((f) => f.id), ...untouched];

  // 3. Merge dropped roles into the nearest kept accent role.
  const assignments: Assignment[] = fixtures
    .filter((f) => roleOf.has(f.id))
    .map((f) => {
      const i = roleOf.get(f.id)!;
      return {
        fixtureId: f.id,
        roleIndexes: [i],
        label: lights[i].role,
        light: lights[i],
        angle: POSITION_ANGLE[lights[i].position],
        updates: {},
        approximated: false,
        notes: [],
      };
    });

  const uncoveredRoles: number[] = [];
  for (let i = 0; i < lights.length; i++) {
    if (taken.has(i)) continue;
    const l = lights[i];
    const candidates = assignments.filter((a) => a.light.role !== 'KEY' && a.light.role !== 'FILL');
    if (l.role === 'FILL' || !candidates.length) {
      uncoveredRoles.push(i);
      warnings.push(
        l.role === 'FILL'
          ? 'No light left for the FILL: use a bounce board, or negative fill for more contrast.'
          : `No light left for the ${l.role} (${POSITION_LABEL[l.position]}).`,
      );
      continue;
    }
    const target = candidates.reduce((a, b) =>
      angleDiff(POSITION_ANGLE[a.light.position], POSITION_ANGLE[l.position]) <=
      angleDiff(POSITION_ANGLE[b.light.position], POSITION_ANGLE[l.position])
        ? a
        : b,
    );
    target.roleIndexes.push(i);
    target.label = `${target.label} + ${l.role}`;
    target.angle = midAngle(target.angle, POSITION_ANGLE[l.position]);
    target.notes.push(
      `Also covers the ${l.role} (${POSITION_LABEL[l.position]}): place it between both positions.`,
    );
  }

  // 4. Values within each fixture's real capabilities.
  for (const a of assignments) {
    const f = fixtures.find((x) => x.id === a.fixtureId)!;
    const intensity = Math.max(...a.roleIndexes.map(intensityOf));
    const built = buildUpdates(f, a.light, intensity);
    a.updates = built.updates;
    a.approximated = built.approximated || a.roleIndexes.length > 1;
    a.notes.push(...built.notes);
  }

  if (fixtures.length < preset.minLights) {
    warnings.unshift(`This look needs at least ${preset.minLights} lights; with ${fixtures.length} it is an approximation.`);
  }
  if (unusedFixtureIds.length && free.length) {
    warnings.push(`${free.length} selected light(s) are not needed by this look and stay as they are.`);
  }
  const approximation =
    fixtures.length < preset.minLights || uncoveredRoles.length > 0 || assignments.some((a) => a.approximated);

  return { presetId: preset.id, assignments, unusedFixtureIds, uncoveredRoles, approximation, warnings };
}

/** The state an assignment changes, captured before applying (for RESTORE). */
export type FixtureSnapshot = Pick<
  Fixture,
  'power' | 'dimmer' | 'cct' | 'tint' | 'colorMode' | 'hue' | 'saturation' | 'gelName' | 'activeFxId' | 'xy'
>;

export const snapshotOf = (f: Fixture): FixtureSnapshot => ({
  power: f.power,
  dimmer: f.dimmer,
  cct: f.cct,
  tint: f.tint,
  colorMode: f.colorMode,
  hue: f.hue,
  saturation: f.saturation,
  gelName: f.gelName,
  activeFxId: f.activeFxId,
  xy: f.xy,
});
