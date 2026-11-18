import { useCallback, useEffect, useState } from 'react';
import type { CinematicPreset } from './types';

/**
 * Persistence for the Cinematic Lighting module, kept apart from the
 * built-in library: custom presets, favourites and the apply history.
 * Stored in this browser / app (localStorage).
 */

export interface HistoryEntry {
  presetId: string;
  presetName: string;
  at: number;
  lights: number;
  approximation: boolean;
}

interface Stored {
  version: 1;
  custom: CinematicPreset[];
  favorites: string[];
  history: HistoryEntry[];
}

const KEY = 'cinelight.cinematic.v1';
const MAX_HISTORY = 30;
const EMPTY: Stored = { version: 1, custom: [], favorites: [], history: [] };

function load(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const s = JSON.parse(raw) as Partial<Stored>;
    return {
      version: 1,
      custom: Array.isArray(s.custom) ? s.custom.map((p) => ({ ...p, custom: true })) : [],
      favorites: Array.isArray(s.favorites) ? s.favorites : [],
      history: Array.isArray(s.history) ? s.history.slice(0, MAX_HISTORY) : [],
    };
  } catch {
    return EMPTY;
  }
}

export function useCinematicStore() {
  const [data, setData] = useState<Stored>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* storage unavailable: keep working in memory */
    }
  }, [data]);

  const saveCustom = useCallback((preset: CinematicPreset) => {
    setData((d) => ({ ...d, custom: [{ ...preset, custom: true }, ...d.custom.filter((p) => p.id !== preset.id)] }));
  }, []);

  const deleteCustom = useCallback((id: string) => {
    setData((d) => ({ ...d, custom: d.custom.filter((p) => p.id !== id), favorites: d.favorites.filter((f) => f !== id) }));
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      favorites: d.favorites.includes(id) ? d.favorites.filter((f) => f !== id) : [id, ...d.favorites],
    }));
  }, []);

  const addHistory = useCallback((entry: HistoryEntry) => {
    setData((d) => ({ ...d, history: [entry, ...d.history].slice(0, MAX_HISTORY) }));
  }, []);

  return { ...data, saveCustom, deleteCustom, toggleFavorite, addHistory };
}

export const newCustomId = () => `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
