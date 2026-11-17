/**
 * Self-test for the LumenRadio TimoTwo BLE DMX encoding and the Creamsource
 * Vortex Mode 8 encoder. Run: npm run test:ble
 *
 * Vectors: examples in https://docs.lumenrad.io/timotwo/ble-interface/ and
 * the Vortex DMX Tables V3.1 (Mode 8).
 */
import { diffRanges, encodeChange, packWrites } from '../src/services/timo/timoLink.ts';
import { encodeVortexMode8, vortexGm16 } from '../src/data/vortexDmx.ts';
import type { Fixture } from '../src/types/cine.ts';

let failed = 0;
const hex = (b: ArrayLike<number>) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
function eq(name: string, got: string | number, want: string | number) {
  const ok = String(got) === String(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      got  ${got}\n      want ${want}`}`);
}

// LumenRadio examples
eq('slots 5-7 = 0 126 254', hex(encodeChange(4, [0, 126, 254])), '0406007efe');
eq('slots 511-512 = 14 30', hex(encodeChange(510, [14, 30])), 'fe050e1e');
const slots = new Uint8Array(512);
slots.set([0, 126, 254], 4);
slots.set([14, 30], 510);
eq('two changes in one write', packWrites(slots, [[4, 7], [510, 512]], 247).map(hex).join('|'), '0406007efefe050e1e');

// Full 512-slot write respects the payload size and the 127-slot limit
const all = packWrites(new Uint8Array(512), [[0, 512]], 20);
eq('20-byte writes: every write <= 20', all.every((w) => w.length <= 20) ? 'yes' : 'no', 'yes');
eq('20-byte writes: 512 slots covered', all.reduce((n, w) => n + w.length, 0) - 2 * Math.ceil(512 / 18), 512);
const big = packWrites(new Uint8Array(512), [[0, 512]], 244);
eq('244-byte writes: count (5 changes of <=127 slots)', big.length, 4);

// Diff
const a = new Uint8Array(512);
const b = a.slice();
b[0] = 1;
b[2] = 1;
b[100] = 9;
eq('diff merges close gaps', JSON.stringify(diffRanges(a, b)), '[[0,3],[100,101]]');

// Vortex Mode 8
eq('G/M neutral', vortexGm16(0), 35268);
eq('G/M -100 (full magenta)', vortexGm16(-1), 5001);
eq('G/M -1', vortexGm16(-0.01), 35267);
eq('G/M +1', vortexGm16(0.01), 35269);
eq('G/M +100 (full green)', vortexGm16(1), 65535);

const base = {
  power: true, dimmer: 100, cct: 2200, tint: 0, colorMode: 'CCT', hue: 0, saturation: 0,
} as unknown as Fixture;
eq('Mode 8 CCT 2200K full', hex(encodeVortexMode8(base, 100)), 'ffff000089c400000000000000' + '00');
eq('Mode 8 CCT 15000K half', hex(encodeVortexMode8({ ...base, cct: 15000 } as Fixture, 50)), '8000ffff89c400000000000000' + '00');
const hsi = encodeVortexMode8({ ...base, colorMode: 'HSI', hue: 360, saturation: 100 } as Fixture, 100);
eq('Mode 8 HSI crossfade/hue/sat', hex(hsi.slice(6, 12)), 'ffffffffffff');
eq('Mode 8 length', hsi.length, 14);

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
