import { DimmingCurve, Fixture } from '../types/cine';
import { kelvinToRgb } from './kelvinToRgb';

export type XY = { x: number; y: number };

/** CIE 1931 2° spectral locus, 380–700 nm (sampled). */
export const SPECTRAL_LOCUS: XY[] = [
  [0.1741, 0.005], [0.1733, 0.0048], [0.1714, 0.0051], [0.1644, 0.0109], [0.1566, 0.0177],
  [0.144, 0.0297], [0.1241, 0.0578], [0.1096, 0.0868], [0.0913, 0.1327], [0.0687, 0.2007],
  [0.0454, 0.295], [0.0235, 0.4127], [0.0082, 0.5384], [0.0039, 0.6548], [0.0139, 0.7502],
  [0.0389, 0.812], [0.0743, 0.8338], [0.1142, 0.8262], [0.1547, 0.8059], [0.2296, 0.7543],
  [0.3016, 0.6923], [0.3731, 0.6245], [0.4441, 0.5547], [0.5125, 0.4866], [0.5752, 0.4242],
  [0.627, 0.3725], [0.6658, 0.334], [0.6915, 0.3083], [0.719, 0.2809], [0.73, 0.27], [0.7347, 0.2653],
].map(([x, y]) => ({ x, y }));

export type GamutId = 'NATIVE' | 'DCI_P3' | 'BT709';

export const GAMUTS: Record<GamutId, { label: string; points: [XY, XY, XY] }> = {
  // Approximate RGBWW LED engine gamut (placeholder until per-fixture data exists).
  NATIVE: { label: 'NATIVE', points: [{ x: 0.7, y: 0.295 }, { x: 0.17, y: 0.7 }, { x: 0.135, y: 0.045 }] },
  DCI_P3: { label: 'DCI-P3', points: [{ x: 0.68, y: 0.32 }, { x: 0.265, y: 0.69 }, { x: 0.15, y: 0.06 }] },
  BT709: { label: 'BT.709', points: [{ x: 0.64, y: 0.33 }, { x: 0.3, y: 0.6 }, { x: 0.15, y: 0.06 }] },
};

export const D65: XY = { x: 0.3127, y: 0.329 };

const gammaEncode = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/** xy chromaticity → display sRGB (0-255), normalised to full brightness. */
export function xyToRgb({ x, y }: XY): { r: number; g: number; b: number } {
  const yy = Math.max(y, 1e-6);
  const X = x / yy;
  const Z = (1 - x - y) / yy;
  let r = 3.2406 * X - 1.5372 - 0.4986 * Z;
  let g = -0.9689 * X + 1.8758 + 0.0415 * Z;
  let b = 0.0557 * X - 0.204 + 1.057 * Z;
  r = Math.max(0, r);
  g = Math.max(0, g);
  b = Math.max(0, b);
  const m = Math.max(r, g, b, 1e-6);
  return {
    r: Math.round(gammaEncode(r / m) * 255),
    g: Math.round(gammaEncode(g / m) * 255),
    b: Math.round(gammaEncode(b / m) * 255),
  };
}

export const rgbCss = ({ r, g, b }: { r: number; g: number; b: number }) => `rgb(${r}, ${g}, ${b})`;

/** RGB → hue (0-360) and saturation (0-100), HSV-style. */
export function rgbToHueSat({ r, g, b }: { r: number; g: number; b: number }): { hue: number; saturation: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { hue: Math.round((h * 60 + 360) % 360), saturation: max ? Math.round((d / max) * 100) : 0 };
}

export function pointInPolygon(p: XY, poly: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function closestOnSegment(p: XY, a: XY, b: XY): XY {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** Keep a chromaticity inside the given triangle (the fixture can't reach beyond it). */
export function clampToGamut(p: XY, tri: [XY, XY, XY]): XY {
  if (pointInPolygon(p, tri)) return p;
  let best = tri[0];
  let bestD = Infinity;
  for (let i = 0; i < 3; i++) {
    const c = closestOnSegment(p, tri[i], tri[(i + 1) % 3]);
    const d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

export const DIMMING_CURVES: { id: DimmingCurve; label: string }[] = [
  { id: 'LINEAR', label: 'Linear' },
  { id: 'EXPONENTIAL', label: 'Exponential' },
  { id: 'LOGARITHMIC', label: 'Logarithmic' },
  { id: 'S_CURVE', label: 'S-Curve' },
];

/** Map a 0-1 fader position through a dimming curve. */
export function applyCurve(t: number, curve: DimmingCurve = 'LINEAR'): number {
  const v = Math.max(0, Math.min(1, t));
  switch (curve) {
    case 'EXPONENTIAL':
      return v * v;
    case 'LOGARITHMIC':
      return Math.log10(1 + 9 * v);
    case 'S_CURVE':
      return v * v * (3 - 2 * v);
    default:
      return v;
  }
}

/** Fader position (0-1) that produces output `v` (0-1) through `curve`. */
export function invertCurve(v: number, curve: DimmingCurve = 'LINEAR'): number {
  const target = Math.max(0, Math.min(1, v));
  if (curve === 'LINEAR') return target;
  // All curves are monotonic on [0,1]: bisection is exact enough.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (applyCurve(mid, curve) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Display colour for a fixture's current colour mode. */
export function fixtureSwatch(f: Fixture, gelHex?: string): string {
  switch (f.colorMode) {
    case 'HSI':
      return `hsl(${f.hue}, ${f.saturation}%, ${50 + (100 - f.saturation) / 4}%)`;
    case 'XY':
      return rgbCss(xyToRgb(f.xy ?? D65));
    case 'GEL':
      return gelHex ?? kelvinToRgb(f.cct, f.tint).hex;
    default:
      return kelvinToRgb(f.cct, f.tint).hex;
  }
}
