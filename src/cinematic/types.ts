/**
 * CINEMATIC LIGHTING DIRECTOR: data model.
 *
 * A cinematic preset describes lighting ROLES (key, fill, back…) around a
 * subject, not physical fixtures. The adapter (adapt.ts) maps roles onto
 * the lights the user actually has, within each light's real capabilities,
 * and the existing drivers send the result. Nothing here talks to hardware.
 */

export type CinematicCategory =
  | 'HOLLYWOOD'
  | 'SCI_FI'
  | 'FILM_NOIR'
  | 'THRILLER'
  | 'DRAMA'
  | 'HORROR'
  | 'VINTAGE'
  | 'NEON'
  | 'COMMERCIAL'
  | 'MUSIC_VIDEO'
  | 'INTERVIEW'
  | 'PORTRAIT';

export const CATEGORIES: { id: CinematicCategory; label: string }[] = [
  { id: 'HOLLYWOOD', label: 'HOLLYWOOD CINEMA' },
  { id: 'SCI_FI', label: 'SCI-FI' },
  { id: 'FILM_NOIR', label: 'FILM NOIR' },
  { id: 'THRILLER', label: 'THRILLER' },
  { id: 'DRAMA', label: 'DRAMA' },
  { id: 'HORROR', label: 'HORROR' },
  { id: 'VINTAGE', label: 'VINTAGE' },
  { id: 'NEON', label: 'NEON' },
  { id: 'COMMERCIAL', label: 'COMMERCIAL' },
  { id: 'MUSIC_VIDEO', label: 'MUSIC VIDEO' },
  { id: 'INTERVIEW', label: 'INTERVIEW' },
  { id: 'PORTRAIT', label: 'PORTRAIT' },
];

export type LightRole = 'KEY' | 'FILL' | 'SIDE' | 'BACK' | 'RIM' | 'HAIR' | 'BACKGROUND';

/** Where the light sits, seen from above. Left / right are camera left / right. */
export type LightPosition =
  | 'FRONT'
  | 'FRONT_LEFT'
  | 'FRONT_RIGHT'
  | 'SIDE_LEFT'
  | 'SIDE_RIGHT'
  | 'BACK_LEFT'
  | 'BACK_RIGHT'
  | 'BACK'
  | 'TOP'
  | 'BACKGROUND';

/**
 * Angle around the subject in degrees, 0 = towards camera, positive = camera
 * right. TOP sits on the camera axis (shown above the subject).
 */
export const POSITION_ANGLE: Record<LightPosition, number> = {
  FRONT: 0,
  FRONT_LEFT: -45,
  FRONT_RIGHT: 45,
  SIDE_LEFT: -90,
  SIDE_RIGHT: 90,
  BACK_LEFT: -140,
  BACK_RIGHT: 140,
  BACK: 180,
  TOP: 0,
  BACKGROUND: 180,
};

export const POSITION_LABEL: Record<LightPosition, string> = {
  FRONT: 'Front (camera axis)',
  FRONT_LEFT: 'Front left 45°',
  FRONT_RIGHT: 'Front right 45°',
  SIDE_LEFT: 'Side left 90°',
  SIDE_RIGHT: 'Side right 90°',
  BACK_LEFT: 'Back left',
  BACK_RIGHT: 'Back right',
  BACK: 'Behind subject',
  TOP: 'Overhead',
  BACKGROUND: 'On the background',
};

export interface CinematicLight {
  role: LightRole;
  position: LightPosition;
  colorMode: 'CCT' | 'HSI';
  cct?: number;
  /** −1 (magenta) … +1 (green), as in Fixture.tint. */
  tint?: number;
  hue?: number;
  saturation?: number;
  /** 0–100 %. */
  intensity: number;
  modifier: string;
  /** Suggested distance to the subject, metres. */
  distanceM: number;
}

export interface CinematicPreset {
  id: string;
  name: string;
  category: CinematicCategory;
  /** Film or series whose look this preset is inspired by (not a reproduction). */
  inspiredBy?: string;
  description: string;
  /** Contrast summary, e.g. "Key:Fill 4:1". */
  ratio: string;
  /** Lights in order of importance: with fewer fixtures, the last ones go first. */
  lights: CinematicLight[];
  minLights: number;
  /** True for presets the user saved. */
  custom?: boolean;
}
