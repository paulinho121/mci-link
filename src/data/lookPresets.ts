import { LookPreset } from '../types/cine';

/** Built-in looks shown in the PRESETS panel. Non-FX looks clear any running FX. */
export const BUILT_IN_LOOKS: LookPreset[] = [
  { id: 'look-2200', label: '2200K', swatch: '#FF9B3C', values: { colorMode: 'CCT', cct: 2200, tint: 0, activeFxId: undefined } },
  { id: 'look-3200', label: '3200K', swatch: '#FFB873', values: { colorMode: 'CCT', cct: 3200, tint: 0, activeFxId: undefined } },
  { id: 'look-4300', label: '4300K', swatch: '#FFD7B0', values: { colorMode: 'CCT', cct: 4300, tint: 0, activeFxId: undefined } },
  { id: 'look-5600', label: '5600K', swatch: '#FFEEE3', values: { colorMode: 'CCT', cct: 5600, tint: 0, activeFxId: undefined } },
  { id: 'look-6500', label: '6500K', swatch: '#FFF9FD', values: { colorMode: 'CCT', cct: 6500, tint: 0, activeFxId: undefined } },
  { id: 'look-moon', label: 'MOONLIGHT', swatch: '#C9D9FF', values: { colorMode: 'CCT', cct: 7500, tint: -0.1, activeFxId: undefined } },
  { id: 'look-fire', label: 'FIRE', swatch: '#FF7A1A', values: { colorMode: 'CCT', cct: 2200, tint: 0.05, activeFxId: 'fx-fire' } },
  { id: 'look-ice', label: 'ICE', swatch: '#8FDDF2', values: { colorMode: 'HSI', hue: 195, saturation: 45, activeFxId: undefined } },
  { id: 'look-garden', label: 'GARDEN', swatch: '#5FCB55', values: { colorMode: 'HSI', hue: 110, saturation: 70, activeFxId: undefined } },
  { id: 'look-sodium', label: 'SODIUM', swatch: '#FF9400', values: { colorMode: 'GEL', gelName: 'USOD Urban Sodium', activeFxId: undefined } },
  { id: 'look-tv', label: 'TV GLOW', swatch: '#A9C4FF', values: { colorMode: 'CCT', cct: 7000, tint: 0, activeFxId: 'fx-tv' } },
  { id: 'look-police', label: 'POLICE', swatch: '#3D5BFF', values: { colorMode: 'HSI', hue: 230, saturation: 100, activeFxId: 'fx-cop' } },
];

export const USER_SLOT_COUNT = 4;
