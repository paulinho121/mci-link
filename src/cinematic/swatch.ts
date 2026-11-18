import type { Fixture } from '../types/cine';
import { kelvinToRgb } from '../utils/kelvinToRgb';
import type { CinematicLight } from './types';

/** Display colour for a preset light. */
export function lightCss(l: Pick<CinematicLight, 'colorMode' | 'cct' | 'tint' | 'hue' | 'saturation'>): string {
  if (l.colorMode === 'HSI') return `hsl(${Math.round(l.hue ?? 0)} ${Math.round(l.saturation ?? 0)}% ${Math.round(88 - (l.saturation ?? 0) * 0.33)}%)`;
  return kelvinToRgb(l.cct ?? 5600, l.tint ?? 0).css;
}

/** Display colour for a fixture state (CCT / HSI; other modes shown neutral). */
export function stateCss(s: Partial<Fixture>): string {
  if (s.colorMode === 'HSI') return lightCss({ colorMode: 'HSI', hue: s.hue, saturation: s.saturation });
  return lightCss({ colorMode: 'CCT', cct: s.cct, tint: s.tint });
}

export function stateText(s: Partial<Fixture>): string {
  if (s.power === false) return 'OFF';
  const level = s.dimmer !== undefined ? `${Math.round(s.dimmer)}%` : '';
  if (s.colorMode === 'HSI') return `${level} · H${Math.round(s.hue ?? 0)}° S${Math.round(s.saturation ?? 0)}%`;
  if (s.colorMode === 'CCT') {
    const t = s.tint ? ` ${s.tint > 0 ? '+' : ''}${s.tint.toFixed(2)}G` : '';
    return `${level} · ${Math.round(s.cct ?? 0)}K${t}`;
  }
  return `${level} · ${s.colorMode ?? ''}`;
}
