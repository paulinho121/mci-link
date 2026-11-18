/**
 * Unit tests for the Cinematic Lighting preset adapter.
 * Run: npm run test:cinematic
 */
import { adaptPreset, whiteForHue } from '../src/cinematic/adapt.ts';
import { BUILT_IN_PRESETS } from '../src/cinematic/presets.ts';
import { CATEGORIES } from '../src/cinematic/types.ts';
import type { Fixture, FixtureType } from '../src/types/cine.ts';

let failed = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`);
}

const fx = (id: string, type: FixtureType, extra: Partial<Fixture> = {}): Fixture =>
  ({ id, type, power: true, dimmer: 50, cct: 5600, tint: 0, colorMode: 'CCT', hue: 0, saturation: 0, muted: false, ...extra }) as Fixture;

const COLOUR = (id: string) => fx(id, 'Aputure Nova P300c'); // full colour 2300–10000K
const BICOLOR = (id: string) => fx(id, 'Amaran 200x S'); // 2700–6500K, tint
const DAYLIGHT = (id: string) => fx(id, 'Aputure 600d Pro'); // 5600K only

const br = BUILT_IN_PRESETS.find((p) => p.id === 'br2049-amber-future')!; // KEY, SIDE, BACK, BACKGROUND

// Library sanity
eq('every category has presets', CATEGORIES.every((c) => BUILT_IN_PRESETS.some((p) => p.category === c.id)), true);
eq('preset ids are unique', new Set(BUILT_IN_PRESETS.map((p) => p.id)).size, BUILT_IN_PRESETS.length);
eq('every preset has a KEY first', BUILT_IN_PRESETS.every((p) => p.lights[0].role === 'KEY'), true);

// 4 lights → one role each, no approximation
{
  const plan = adaptPreset(br, [COLOUR('a'), COLOUR('b'), COLOUR('c'), COLOUR('d')]);
  eq('4 lights: labels', plan.assignments.map((a) => a.label), ['KEY', 'SIDE', 'BACK', 'BACKGROUND']);
  eq('4 lights: not an approximation', plan.approximation, false);
  eq('4 lights: key is HSI amber', [plan.assignments[0].updates.colorMode, plan.assignments[0].updates.hue], ['HSI', 32]);
}

// 3 lights → key, side, back; background merged into the nearest accent (back)
{
  const plan = adaptPreset(br, [COLOUR('a'), COLOUR('b'), COLOUR('c')]);
  eq('3 lights: labels', plan.assignments.map((a) => a.label), ['KEY', 'SIDE', 'BACK + BACKGROUND']);
  eq('3 lights: flagged as approximation', plan.approximation, true);
}

// 2 lights → key + one light combining side and back (spec example)
{
  const plan = adaptPreset(br, [COLOUR('a'), COLOUR('b')]);
  eq('2 lights: labels', plan.assignments.map((a) => a.label), ['KEY', 'SIDE + BACK + BACKGROUND']);
  eq('2 lights: combined light takes the strongest intensity', plan.assignments[1].updates.dimmer, 80);
  eq('2 lights: warns below minimum', plan.warnings.some((w) => w.includes('at least 3')), true);
}

// One plan entry per physical fixture
{
  const plan = adaptPreset(br, [COLOUR('a'), COLOUR('b')]);
  eq('no duplicate fixtures', new Set(plan.assignments.map((a) => a.fixtureId)).size, plan.assignments.length);
}

// Colour roles go to colour fixtures; white key goes to the white fixture
{
  const batman = BUILT_IN_PRESETS.find((p) => p.id === 'batman-gotham-noir')!; // KEY 6500K, BACK blue
  const plan = adaptPreset(batman, [COLOUR('colour'), BICOLOR('white')]);
  eq('white key on the bi-colour light', plan.assignments.find((a) => a.label.startsWith('KEY'))!.fixtureId, 'white');
  eq('blue back on the colour light', plan.assignments.find((a) => a.label.startsWith('BACK'))!.fixtureId, 'colour');
  eq('6500K within bi-colour range kept', plan.assignments.find((a) => a.fixtureId === 'white')!.updates.cct, 6500);
}

// Colour role without a colour fixture prefers bi-colour over daylight
{
  const dune = BUILT_IN_PRESETS.find((p) => p.id === 'dune-desert-epic')!; // KEY amber, BACK orange, FILL gold
  const plan = adaptPreset(dune, [COLOUR('c'), DAYLIGHT('d'), BICOLOR('b')]);
  eq('orange back goes to bi-colour', plan.assignments.find((a) => a.light.role === 'BACK')!.fixtureId, 'b');
}

// White-only fixture never receives HSI; values clamped to range
{
  const plan = adaptPreset(br, [DAYLIGHT('d')]);
  const a = plan.assignments[0];
  eq('daylight-only: CCT mode', a.updates.colorMode, 'CCT');
  eq('daylight-only: clamped to 5600K', a.updates.cct, 5600);
  eq('daylight-only: no tint (unsupported)', a.updates.tint, 0);
  eq('daylight-only: flagged', a.approximated, true);
}

// FILL is never merged into another light
{
  const godfather = BUILT_IN_PRESETS.find((p) => p.id === 'godfather-old-world')!; // KEY, SIDE, BACK, FILL
  const plan = adaptPreset(godfather, [BICOLOR('a'), BICOLOR('b'), BICOLOR('c')]);
  eq('fill not merged', plan.assignments.some((a) => a.label.includes('FILL')), false);
  eq('fill reported uncovered', plan.uncoveredRoles, [3]);
}

// More fixtures than roles: extras untouched
{
  const plan = adaptPreset(BUILT_IN_PRESETS.find((p) => p.id === 'interrogation-top')!, [BICOLOR('a'), BICOLOR('b'), BICOLOR('c')]);
  eq('extras not assigned', plan.unusedFixtureIds, ['c']);
}

// Manual override and "leave untouched"
{
  const plan = adaptPreset(br, [COLOUR('a'), COLOUR('b'), COLOUR('c')], { overrides: { a: 2, c: null } });
  eq('override: a is BACK', plan.assignments.find((x) => x.fixtureId === 'a')!.light.role, 'BACK');
  eq('override: b takes KEY', plan.assignments.find((x) => x.fixtureId === 'b')!.light.role, 'KEY');
  eq('override: c untouched', plan.unusedFixtureIds.includes('c'), true);
}

// Intensity override
{
  const plan = adaptPreset(br, [COLOUR('a')], { intensities: { 0: 33 } });
  eq('1 light: key only, intensity override', plan.assignments[0].updates.dimmer, 33);
  eq('1 light: other roles uncovered (never merged into the key)', plan.uncoveredRoles, [1, 2, 3]);
  const solo = adaptPreset(br, [COLOUR('a'), COLOUR('b'), COLOUR('c'), COLOUR('d')], { intensities: { 0: 33 } });
  eq('intensity override alone', solo.assignments[0].updates.dimmer, 33);
}

// whiteForHue
eq('amber → warm', whiteForHue(32, 85, { cctMin: 2000, cctMax: 10000, supportsTint: true }).cct, 2710);
eq('blue → cool, clamped', whiteForHue(220, 100, { cctMin: 2700, cctMax: 6500, supportsTint: true }).cct, 6500);
eq('green → plus green', whiteForHue(120, 100, { cctMin: 2700, cctMax: 6500, supportsTint: true }).tint, 0.6);
eq('magenta, no tint support → 0', whiteForHue(300, 100, { cctMin: 2700, cctMax: 6500, supportsTint: false }).tint, 0);

// Empty selection
eq('no lights → warning', adaptPreset(br, []).warnings, ['No lights selected.']);

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
