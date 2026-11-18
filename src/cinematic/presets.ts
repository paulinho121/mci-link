import type { CinematicCategory, CinematicLight, CinematicPreset, LightPosition, LightRole } from './types';

/**
 * Built-in cinematic presets.
 *
 * Each one is an INTERPRETATION inspired by the visual language of a film or
 * genre, built from common cinematography practice. They do not reproduce
 * the original lighting, and use no logos, posters or stills.
 */

type Spec = [
  role: LightRole,
  position: LightPosition,
  color: { cct: number; tint?: number } | { hue: number; sat: number },
  intensity: number,
  modifier: string,
  distanceM: number,
];

const L = ([role, position, color, intensity, modifier, distanceM]: Spec): CinematicLight =>
  'cct' in color
    ? { role, position, colorMode: 'CCT', cct: color.cct, tint: color.tint ?? 0, intensity, modifier, distanceM }
    : { role, position, colorMode: 'HSI', hue: color.hue, saturation: color.sat, intensity, modifier, distanceM };

const P = (
  id: string,
  name: string,
  category: CinematicCategory,
  inspiredBy: string | undefined,
  description: string,
  ratio: string,
  minLights: number,
  lights: Spec[],
): CinematicPreset => ({ id, name, category, inspiredBy, description, ratio, minLights, lights: lights.map(L) });

export const BUILT_IN_PRESETS: CinematicPreset[] = [
  // --- SCI-FI ---
  P('br2049-amber-future', 'Amber Future', 'SCI_FI', 'Blade Runner 2049',
    'Futuristic, high-contrast amber key against a cyan side light and a hot orange rim. Works best with haze.',
    'Key:Fill 4:1', 3, [
      ['KEY', 'FRONT_LEFT', { hue: 32, sat: 85 }, 70, 'Large soft source, 4×4 diffusion', 2.5],
      ['SIDE', 'SIDE_RIGHT', { hue: 190, sat: 80 }, 40, 'Strip softbox with grid', 2],
      ['BACK', 'BACK_RIGHT', { hue: 22, sat: 95 }, 80, 'Bare head or narrow grid', 3],
      ['BACKGROUND', 'BACKGROUND', { hue: 5, sat: 90 }, 35, 'Wash on the wall, no diffusion', 3],
    ]),
  P('br82-rain-replicant', 'Rain-Lit Replicant', 'SCI_FI', 'Blade Runner (1982)',
    'Hard, cool shafts from behind through smoke, a dim side key and warm neon spill in the background.',
    'Back:Key 2:1', 2, [
      ['KEY', 'SIDE_LEFT', { cct: 4300 }, 40, 'Hard source through blinds or a cookie', 2.5],
      ['BACK', 'BACK_RIGHT', { hue: 200, sat: 50 }, 80, 'Hard, narrow beam into haze', 4],
      ['BACKGROUND', 'BACKGROUND', { hue: 28, sat: 85 }, 35, 'Practical neon or coloured wash', 3],
      ['FILL', 'FRONT_RIGHT', { cct: 3200 }, 10, 'Bounce board', 2],
    ]),
  P('matrix-green-cast', 'Digital Green Cast', 'SCI_FI', 'The Matrix',
    'Desaturated daylight pushed towards green, with green side and back light for a synthetic world.',
    'Key:Fill 3:1', 2, [
      ['KEY', 'FRONT_LEFT', { cct: 5000, tint: 0.35 }, 60, 'Medium softbox', 2.5],
      ['SIDE', 'SIDE_RIGHT', { hue: 135, sat: 55 }, 35, 'Strip softbox', 2],
      ['BACK', 'BACK', { hue: 140, sat: 40 }, 50, 'Grid or snoot', 3],
    ]),
  P('interstellar-cosmic-day', 'Cosmic Daylight', 'SCI_FI', 'Interstellar',
    'Naturalistic hard daylight from a window side, soft cool fill and a small warm practical behind.',
    'Key:Fill 4:1', 2, [
      ['KEY', 'SIDE_LEFT', { cct: 5600 }, 75, 'Hard source through a window frame', 3.5],
      ['FILL', 'FRONT_RIGHT', { cct: 6500 }, 20, 'Large bounce', 2],
      ['BACK', 'BACK_LEFT', { cct: 3200 }, 40, 'Practical lamp or small fresnel', 2.5],
      ['BACKGROUND', 'BACKGROUND', { cct: 8000 }, 15, 'Soft wash', 3],
    ]),

  // --- FILM NOIR ---
  P('batman-gotham-noir', 'Gotham Noir', 'FILM_NOIR', 'The Batman',
    'Dark and moody: soft cold side key, almost no fill, deep blue rim and a dark red accent.',
    'Key:Fill 8:1', 3, [
      ['KEY', 'SIDE_LEFT', { cct: 6500 }, 45, 'Soft source, heavy grid', 2],
      ['BACK', 'BACK_RIGHT', { hue: 225, sat: 90 }, 55, 'Narrow grid', 3],
      ['SIDE', 'SIDE_RIGHT', { hue: 0, sat: 95 }, 30, 'Strip with grid', 2],
      ['FILL', 'FRONT_RIGHT', { cct: 5600 }, 8, 'Bounce, or negative fill instead', 2],
    ]),
  P('noir-venetian-blind', 'Venetian Blind Noir', 'FILM_NOIR', undefined,
    'Classic noir: hard side key broken by blinds, deep shadows and a cool edge from behind.',
    'Key:Fill 12:1', 2, [
      ['KEY', 'SIDE_LEFT', { cct: 4300 }, 75, 'Hard fresnel through blinds / cookie', 3],
      ['BACK', 'BACK_RIGHT', { cct: 5600 }, 40, 'Hard, narrow', 3],
      ['FILL', 'FRONT_RIGHT', { cct: 4300 }, 5, 'Small bounce or none', 2],
    ]),

  // --- THRILLER ---
  P('wick-neon-assassin', 'Neon Assassin', 'THRILLER', 'John Wick',
    'Saturated purple key, strong cyan rim and magenta background: stylised action at night.',
    'Rim:Key 1.5:1', 3, [
      ['KEY', 'SIDE_LEFT', { hue: 280, sat: 70 }, 50, 'Medium softbox', 2],
      ['BACK', 'BACK_RIGHT', { hue: 190, sat: 90 }, 75, 'Hard rim, grid', 3],
      ['BACKGROUND', 'BACKGROUND', { hue: 320, sat: 90 }, 45, 'Coloured wash on the set', 3],
      ['FILL', 'FRONT_RIGHT', { cct: 4300 }, 10, 'Bounce', 2],
    ]),
  P('inception-dream', 'Dream Architecture', 'THRILLER', 'Inception',
    'Polished, controlled light: soft neutral key, gentle fill, warm rim and a steel-blue background.',
    'Key:Fill 2:1', 3, [
      ['KEY', 'FRONT_LEFT', { cct: 4500 }, 65, 'Large soft source', 2.5],
      ['FILL', 'FRONT_RIGHT', { cct: 5000 }, 30, 'Bounce or book light', 2.5],
      ['BACK', 'BACK_RIGHT', { cct: 3200 }, 50, 'Fresnel, spot', 3],
      ['BACKGROUND', 'BACKGROUND', { hue: 205, sat: 35 }, 30, 'Soft wash', 3],
    ]),
  P('interrogation-top', 'Interrogation Hard Top', 'THRILLER', undefined,
    'Single hard overhead source, eyes in shadow, a faint edge to separate from black.',
    'Key:Fill 16:1', 1, [
      ['KEY', 'TOP', { cct: 4300 }, 80, 'Hard source overhead, no diffusion', 1.5],
      ['BACK', 'BACK', { cct: 5600 }, 20, 'Small hard rim', 3],
    ]),

  // --- DRAMA ---
  P('joker-psyche', 'Stairway Psyche', 'DRAMA', 'Joker',
    'Warm white key against sickly green side light and red / amber accents: psychological tension.',
    'Key:Fill 6:1', 3, [
      ['KEY', 'FRONT_LEFT', { cct: 3000 }, 60, 'Medium soft source', 2],
      ['SIDE', 'SIDE_RIGHT', { hue: 120, sat: 70 }, 40, 'Strip softbox', 2],
      ['BACK', 'BACK_LEFT', { hue: 8, sat: 85 }, 55, 'Grid', 3],
      ['BACKGROUND', 'BACKGROUND', { hue: 35, sat: 80 }, 30, 'Practicals or wash', 3],
    ]),
  P('drama-window', 'Window Drama', 'DRAMA', undefined,
    'Soft daylight from a window side, low fill and a warm practical behind for depth.',
    'Key:Fill 4:1', 2, [
      ['KEY', 'SIDE_LEFT', { cct: 5600 }, 70, 'Large diffusion frame at the window', 2.5],
      ['FILL', 'FRONT_RIGHT', { cct: 5000 }, 20, 'Bounce', 2],
      ['BACK', 'BACK_LEFT', { cct: 3200 }, 25, 'Practical or small fresnel', 2.5],
    ]),

  // --- HOLLYWOOD CINEMA ---
  P('dune-desert-epic', 'Desert Epic', 'HOLLYWOOD', 'Dune',
    'Epic, sun-baked look: amber key, soft golden fill and a burnt orange rim, moderate contrast.',
    'Key:Fill 2.5:1', 2, [
      ['KEY', 'FRONT_LEFT', { hue: 35, sat: 60 }, 80, 'Large soft source', 3],
      ['BACK', 'BACK_RIGHT', { hue: 20, sat: 85 }, 75, 'Hard, as low sun', 4],
      ['FILL', 'FRONT_RIGHT', { hue: 42, sat: 35 }, 30, 'Gold bounce', 2.5],
    ]),
  P('godfather-old-world', 'Old World Shadows', 'HOLLYWOOD', 'The Godfather',
    'Classic top-weighted warm key, eyes falling into shadow, almost no fill and a discreet back light.',
    'Key:Fill 8:1', 2, [
      ['KEY', 'FRONT_LEFT', { cct: 2900, tint: 0.05 }, 55, 'Soft source high above, heavy grid', 1.8],
      ['SIDE', 'SIDE_RIGHT', { cct: 2700 }, 25, 'Small soft source', 2],
      ['BACK', 'BACK_LEFT', { cct: 3200 }, 15, 'Small fresnel', 3],
      ['FILL', 'FRONT_RIGHT', { cct: 3000 }, 5, 'Very low bounce', 2],
    ]),
  P('madmax-wasteland', 'Wasteland Heat', 'HOLLYWOOD', 'Mad Max: Fury Road',
    'Hot orange hard key with teal from behind: bold teal-and-orange action contrast.',
    'Key:Fill 2:1', 2, [
      ['KEY', 'FRONT_LEFT', { hue: 30, sat: 70 }, 90, 'Hard source', 3.5],
      ['BACK', 'BACK', { hue: 190, sat: 45 }, 55, 'Soft back wash', 3],
      ['FILL', 'FRONT_RIGHT', { hue: 25, sat: 50 }, 45, 'Bounce', 2.5],
    ]),
  P('007-tuxedo', 'Tuxedo Glamour', 'HOLLYWOOD', '007 films',
    'Glamorous butterfly key, clamshell fill from below, strong hair light and a gold background.',
    'Key:Fill 2:1', 3, [
      ['KEY', 'FRONT', { cct: 4300 }, 70, 'Beauty dish above the lens', 1.5],
      ['HAIR', 'BACK', { cct: 3200 }, 60, 'Fresnel with snoot', 2.5],
      ['FILL', 'FRONT', { cct: 4300 }, 35, 'Reflector / soft source below the lens', 1],
      ['BACKGROUND', 'BACKGROUND', { hue: 30, sat: 60 }, 30, 'Wash or pattern', 3],
    ]),

  // --- HORROR ---
  P('stranger-80s', 'Upside-Down 80s', 'HORROR', 'Stranger Things',
    'Red key from the side, cold blue fill and rim: eerie 80s supernatural mood.',
    'Key:Fill 3:1', 2, [
      ['KEY', 'SIDE_RIGHT', { hue: 0, sat: 90 }, 55, 'Medium soft source', 2],
      ['BACK', 'BACK_LEFT', { hue: 200, sat: 80 }, 60, 'Grid', 3],
      ['FILL', 'FRONT_LEFT', { hue: 220, sat: 60 }, 20, 'Bounce or small soft', 2],
      ['BACKGROUND', 'BACKGROUND', { hue: 0, sat: 100 }, 30, 'Wash', 3],
    ]),
  P('horror-under-light', 'Under-Light Dread', 'HORROR', undefined,
    'Unnatural light from below with a sickly tint, cold rim, no fill.',
    'Key:Fill 10:1', 1, [
      ['KEY', 'FRONT', { hue: 120, sat: 30 }, 45, 'Small source low, pointing up', 1],
      ['BACK', 'BACK', { hue: 210, sat: 70 }, 35, 'Grid', 3],
    ]),

  // --- VINTAGE ---
  P('peaky-smoky', 'Smoky Industrial', 'VINTAGE', 'Peaky Blinders',
    'Warm hard window light, strong haze-lit back light and fire glow, deep shadows.',
    'Key:Fill 10:1', 2, [
      ['KEY', 'SIDE_LEFT', { cct: 2700 }, 55, 'Hard source through a window', 3],
      ['BACK', 'BACK_RIGHT', { cct: 3200 }, 70, 'Hard beam into haze', 4],
      ['BACKGROUND', 'BACKGROUND', { hue: 30, sat: 70 }, 20, 'Fire / practical flicker', 3],
      ['FILL', 'FRONT_RIGHT', { cct: 2900 }, 6, 'Small bounce', 2],
    ]),
  P('golden-age', 'Golden Age Hollywood', 'VINTAGE', undefined,
    'Studio-era glamour: hard butterfly key, hair light and a spot pattern on the background.',
    'Key:Fill 3:1', 2, [
      ['KEY', 'FRONT', { cct: 3200 }, 75, 'Hard fresnel above the lens', 2.5],
      ['HAIR', 'BACK', { cct: 3200 }, 70, 'Fresnel, spot', 2.5],
      ['FILL', 'FRONT_RIGHT', { cct: 3200 }, 25, 'Soft fill', 2.5],
      ['BACKGROUND', 'BACKGROUND', { cct: 3200 }, 35, 'Spot with a pattern', 3],
    ]),

  // --- NEON ---
  P('drive-night-neon', 'Night Drive Neon', 'NEON', 'Drive',
    'Soft pink key, electric blue side light and a magenta rim: urban night.',
    'Key:Side 1:1', 2, [
      ['KEY', 'FRONT_RIGHT', { hue: 330, sat: 40 }, 55, 'Soft source', 2],
      ['SIDE', 'SIDE_LEFT', { hue: 215, sat: 95 }, 60, 'Strip or tube', 1.5],
      ['BACK', 'BACK', { hue: 300, sat: 90 }, 70, 'Tube or grid', 2.5],
    ]),
  P('cyberpunk-alley', 'Cyberpunk Alley', 'NEON', undefined,
    'Cyan and magenta from both sides with a violet rim.',
    'Side:Side 1:1', 2, [
      ['KEY', 'SIDE_LEFT', { hue: 185, sat: 90 }, 60, 'Tube or strip', 1.5],
      ['SIDE', 'SIDE_RIGHT', { hue: 320, sat: 90 }, 60, 'Tube or strip', 1.5],
      ['BACK', 'BACK', { hue: 270, sat: 80 }, 50, 'Grid', 2.5],
    ]),

  // --- MUSIC VIDEO ---
  P('euphoria-glitter', 'Glitter Dreamscape', 'MUSIC_VIDEO', 'Euphoria',
    'Violet key, pink side light and blue rim: dreamy, saturated night.',
    'Key:Side 1.2:1', 2, [
      ['KEY', 'FRONT_LEFT', { hue: 290, sat: 65 }, 55, 'Soft source', 2],
      ['SIDE', 'SIDE_RIGHT', { hue: 330, sat: 80 }, 45, 'Tube', 1.5],
      ['BACK', 'BACK', { hue: 200, sat: 85 }, 60, 'Grid', 2.5],
      ['BACKGROUND', 'BACKGROUND', { hue: 270, sat: 90 }, 40, 'Wash', 3],
    ]),
  P('rgb-split', 'RGB Split Performance', 'MUSIC_VIDEO', undefined,
    'Red from one side, blue from the other and a purple rim for performance shots.',
    'Side:Side 1:1', 2, [
      ['KEY', 'SIDE_LEFT', { hue: 0, sat: 90 }, 70, 'Hard source or tube', 2],
      ['SIDE', 'SIDE_RIGHT', { hue: 225, sat: 90 }, 70, 'Hard source or tube', 2],
      ['BACK', 'BACK', { hue: 280, sat: 80 }, 60, 'Grid', 2.5],
    ]),

  // --- COMMERCIAL ---
  P('high-key-clean', 'Clean High Key', 'COMMERCIAL', undefined,
    'Bright, low-contrast daylight look with a lit background.',
    'Key:Fill 1.5:1', 2, [
      ['KEY', 'FRONT_LEFT', { cct: 5600 }, 85, 'Large octabox', 2.5],
      ['BACKGROUND', 'BACKGROUND', { cct: 5600 }, 90, 'Even wash', 2],
      ['FILL', 'FRONT_RIGHT', { cct: 5600 }, 70, 'Large soft source', 2.5],
      ['BACK', 'BACK', { cct: 5600 }, 55, 'Strip', 2.5],
    ]),
  P('product-hero', 'Product Hero Rim', 'COMMERCIAL', undefined,
    'Two strong strip rims define the shape, a low key reveals the front, blue background.',
    'Rim:Key 2.5:1', 2, [
      ['KEY', 'FRONT_RIGHT', { cct: 5000 }, 35, 'Small softbox', 1.5],
      ['RIM', 'BACK_LEFT', { cct: 6000 }, 85, 'Strip softbox', 1],
      ['RIM', 'BACK_RIGHT', { cct: 6000 }, 85, 'Strip softbox', 1],
      ['BACKGROUND', 'BACKGROUND', { hue: 215, sat: 70 }, 30, 'Gradient wash', 2],
    ]),

  // --- INTERVIEW ---
  P('interview-classic', 'Classic Interview', 'INTERVIEW', undefined,
    'Soft 45° key, gentle fill, back light for separation and a warm background accent.',
    'Key:Fill 2:1', 2, [
      ['KEY', 'FRONT_LEFT', { cct: 5600 }, 70, 'Large softbox or lantern', 2],
      ['BACK', 'BACK_RIGHT', { cct: 5600 }, 45, 'Small fresnel or strip', 2.5],
      ['FILL', 'FRONT_RIGHT', { cct: 5600 }, 35, 'Bounce or soft source', 2],
      ['BACKGROUND', 'BACKGROUND', { cct: 3200 }, 25, 'Practical or small wash', 2.5],
    ]),
  P('interview-doc', 'Cinematic Doc Interview', 'INTERVIEW', undefined,
    'Short-side key on the far side of the face, negative fill, warm edge and a cool background.',
    'Key:Fill 6:1', 2, [
      ['KEY', 'FRONT_RIGHT', { cct: 4300 }, 60, 'Large soft source, skirt / grid', 1.8],
      ['BACK', 'BACK_LEFT', { cct: 3200 }, 35, 'Small fresnel', 2.5],
      ['BACKGROUND', 'BACKGROUND', { hue: 210, sat: 40 }, 20, 'Wash or practicals', 3],
    ]),

  // --- PORTRAIT ---
  P('portrait-rembrandt', 'Rembrandt Portrait', 'PORTRAIT', undefined,
    'Key 45° high, triangle of light on the far cheek, low fill, soft rim.',
    'Key:Fill 4:1', 1, [
      ['KEY', 'FRONT_LEFT', { cct: 4300 }, 70, 'Softbox high, 45° from the nose line', 1.8],
      ['BACK', 'BACK_RIGHT', { cct: 4300 }, 30, 'Strip', 2],
      ['FILL', 'FRONT_RIGHT', { cct: 4300 }, 15, 'Reflector', 1.5],
    ]),
  P('portrait-butterfly', 'Butterfly Beauty', 'PORTRAIT', undefined,
    'Beauty light above the lens, clamshell fill from below, hair light and lit background.',
    'Key:Fill 2:1', 2, [
      ['KEY', 'FRONT', { cct: 5600 }, 75, 'Beauty dish above the lens', 1.2],
      ['FILL', 'FRONT', { cct: 5600 }, 40, 'Soft source / reflector below the lens', 1],
      ['HAIR', 'BACK', { cct: 5600 }, 50, 'Strip or snoot from above', 1.5],
      ['BACKGROUND', 'BACKGROUND', { cct: 5600 }, 40, 'Even wash', 2],
    ]),
];
