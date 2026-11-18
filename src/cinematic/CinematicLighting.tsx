import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, Star, Check, X, RotateCcw, Power, Save, Copy, Trash2, ChevronLeft, AlertTriangle, Link2, Pencil } from 'lucide-react';
import type { Fixture } from '../types/cine';
import { DRIVERS, TRANSPORT_LABELS } from '../services/lightLink';
import { profileFor } from '../data/fixtureProfiles';
import { rgbToHueSat, xyToRgb, D65 } from '../utils/color';
import { sound } from '../utils/soundEffects';
import { BUILT_IN_PRESETS } from './presets';
import { CATEGORIES, CinematicCategory, CinematicLight, CinematicPreset, LightPosition, LightRole, POSITION_LABEL } from './types';
import { AdaptedPlan, FixtureSnapshot, RoleOverrides, adaptPreset, snapshotOf } from './adapt';
import { FadeJob, runFade } from './fade';
import { HistoryEntry, newCustomId, useCinematicStore } from './store';
import { lightCss, stateCss, stateText } from './swatch';
import { LightingScheme } from './LightingScheme';

/**
 * CINEMATIC LIGHTING DIRECTOR
 *
 * Pick a look → see the scheme → check which of YOUR lights take which role
 * → apply (with a fade) to the real lights through the existing drivers.
 * Only lights with a live link are selected by default; simulated demo
 * links are labelled as such and never reported as real.
 */

interface Props {
  fixtures: Fixture[];
  setFixtures: React.Dispatch<React.SetStateAction<Fixture[]>>;
  onOpenPairing: () => void;
}

type View = CinematicCategory | 'MINE' | 'FAVORITES' | 'HISTORY';
type Reach = 'live' | 'simulated' | 'offline' | 'unlinked';

const reachOf = (f: Fixture): Reach => {
  if (!f.link) return 'unlinked';
  if (DRIVERS[f.link.transport].simulated) return 'simulated';
  return f.link.status === 'connected' ? 'live' : 'offline';
};

const REACH_BADGE: Record<Reach, { text: string; cls: string }> = {
  live: { text: 'LIVE', cls: 'border-[#52C98A]/60 text-[#52C98A]' },
  simulated: { text: 'SIMULATED', cls: 'border-[#E6B45F]/50 text-[#E6B45F]' },
  offline: { text: 'OFFLINE', cls: 'border-[#E56D6D]/60 text-[#E56D6D]' },
  unlinked: { text: 'NO LINK', cls: 'border-[#343840] text-[#A4A8B1]' },
};

const FADES = [
  { s: 0, label: 'CUT' },
  { s: 1, label: '1s' },
  { s: 3, label: '3s' },
  { s: 5, label: '5s' },
  { s: 10, label: '10s' },
];

const ROLE_ORDER: LightRole[] = ['KEY', 'FILL', 'SIDE', 'BACK', 'RIM', 'HAIR', 'BACKGROUND'];
const DEFAULT_POSITION: Record<LightRole, LightPosition> = {
  KEY: 'FRONT_LEFT',
  FILL: 'FRONT_RIGHT',
  SIDE: 'SIDE_RIGHT',
  BACK: 'BACK_RIGHT',
  RIM: 'BACK_LEFT',
  HAIR: 'BACK',
  BACKGROUND: 'BACKGROUND',
};

const paletteGradient = (p: CinematicPreset) => {
  const stops = p.lights.map(lightCss);
  return stops.length > 1 ? `linear-gradient(90deg, ${stops.join(', ')})` : stops[0];
};

const card = 'bg-[#191B20] border border-[#343840]';
const chip = (on: boolean) =>
  `px-2 py-1 border text-[10px] font-mono font-bold tracking-wider ${on ? 'border-[#E5A962] text-[#E5A962] bg-[#E5A962]/10' : 'border-[#343840] text-[#A4A8B1] hover:text-[#F3F0EA]'}`;
const btn = 'flex items-center justify-center space-x-1.5 px-3 py-2 border font-mono font-bold text-[10px] tracking-widest disabled:opacity-40';

/** Current state of a fixture as a preset light (for SAVE MY LIGHTING). */
function lightFromFixture(f: Fixture, role: LightRole, position: LightPosition): CinematicLight {
  const base = { role, position, intensity: Math.round(f.dimmer), modifier: '', distanceM: 2 };
  if (f.colorMode === 'HSI') return { ...base, colorMode: 'HSI', hue: f.hue, saturation: f.saturation };
  if (f.colorMode === 'XY') {
    const hs = rgbToHueSat(xyToRgb(f.xy ?? D65));
    return { ...base, colorMode: 'HSI', hue: hs.hue, saturation: hs.saturation };
  }
  return { ...base, colorMode: 'CCT', cct: f.cct, tint: f.tint };
}

export const CinematicLighting: React.FC<Props> = ({ fixtures, setFixtures, onOpenPairing }) => {
  const store = useCinematicStore();
  const allPresets = useMemo(() => [...store.custom, ...BUILT_IN_PRESETS], [store.custom]);

  const [view, setView] = useState<View>('HOLLYWOOD');
  const [presetId, setPresetId] = useState<string | null>(null);
  const preset = allPresets.find((p) => p.id === presetId) ?? null;

  // Light selection: live lights by default.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(fixtures.filter((f) => reachOf(f) === 'live').map((f) => f.id)),
  );
  const [overrides, setOverrides] = useState<RoleOverrides>({});
  const [intensities, setIntensities] = useState<Record<number, number>>({});
  const [fadeS, setFadeS] = useState(3);
  const [customFade, setCustomFade] = useState('');
  const [confirm, setConfirm] = useState<{ plan: AdaptedPlan; scope: 'selected' | 'all' } | null>(null);
  const [result, setResult] = useState<{ presetName: string; rows: { id: string; ok: boolean; text: string }[] } | null>(null);
  const [previous, setPrevious] = useState<{ label: string; snaps: Record<string, FixtureSnapshot> } | null>(null);
  const [saveName, setSaveName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const fadeJob = useRef<FadeJob | null>(null);
  const fixturesRef = useRef(fixtures);
  fixturesRef.current = fixtures;

  useEffect(() => () => fadeJob.current?.cancel(), []);

  // New lights that come online join the selection; removed ones leave it.
  const liveKey = fixtures.filter((f) => reachOf(f) === 'live').map((f) => f.id).join(',');
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => fixtures.some((f) => f.id === id && reachOf(f) !== 'offline')));
      liveKey.split(',').filter(Boolean).forEach((id) => next.add(id));
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey, fixtures.length]);

  // Reset per-preset tweaks when switching look.
  useEffect(() => {
    setOverrides({});
    setIntensities({});
    setResult(null);
    setRenaming(null);
  }, [presetId]);

  const selectedFixtures = fixtures.filter((f) => selected.has(f.id));
  const plan = useMemo(
    () => (preset ? adaptPreset(preset, selectedFixtures, { overrides, intensities }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preset, selectedFixtures.map((f) => `${f.id}:${f.type}:${f.muted}`).join('|'), overrides, intensities],
  );

  const fadeMs = (customFade ? Math.max(0, Number(customFade) || 0) : fadeS) * 1000;
  const liveCount = fixtures.filter((f) => reachOf(f) === 'live').length;

  const presetsInView: CinematicPreset[] =
    view === 'MINE'
      ? store.custom
      : view === 'FAVORITES'
        ? allPresets.filter((p) => store.favorites.includes(p.id))
        : view === 'HISTORY'
          ? []
          : allPresets.filter((p) => p.category === view);

  // ---------------------------------------------------------------- actions

  const startFade = (targets: Record<string, Partial<Fixture>>, onDone?: () => void) => {
    fadeJob.current?.cancel();
    fadeJob.current = runFade(
      fixturesRef.current,
      targets,
      fadeMs,
      (frame) => setFixtures((prev) => prev.map((f) => (frame[f.id] ? { ...f, ...frame[f.id] } : f))),
      onDone,
    );
  };

  const askApply = (scope: 'selected' | 'all') => {
    if (!preset) return;
    sound.click();
    const targets =
      scope === 'all' ? fixtures.filter((f) => reachOf(f) === 'live') : selectedFixtures.filter((f) => reachOf(f) !== 'offline');
    const p = adaptPreset(preset, targets, { overrides, intensities });
    setConfirm({ plan: p, scope });
  };

  const doApply = () => {
    if (!confirm || !preset) return;
    sound.click();
    const { plan: p } = confirm;
    const touched = fixtures.filter((f) => p.assignments.some((a) => a.fixtureId === f.id));
    setPrevious({ label: preset.name, snaps: Object.fromEntries(touched.map((f) => [f.id, snapshotOf(f)])) });
    const targets = Object.fromEntries(p.assignments.map((a) => [a.fixtureId, a.updates]));
    setConfirm(null);
    setResult(null);
    startFade(targets, () => {
      // Report per light from the real link state once the fade has landed.
      const now = fixturesRef.current;
      const rows = p.assignments.map((a) => {
        const f = now.find((x) => x.id === a.fixtureId);
        const reach = f ? reachOf(f) : 'offline';
        const via = f?.link ? TRANSPORT_LABELS[f.link.transport] : '';
        return {
          id: a.fixtureId,
          ok: reach === 'live',
          text:
            reach === 'live'
              ? `Sent via ${via}`
              : reach === 'simulated'
                ? 'Simulated link: no real light received it'
                : reach === 'unlinked'
                  ? 'No link: console only'
                  : 'Not reachable: link lost, not applied',
        };
      });
      setResult({ presetName: preset.name, rows });
      const entry: HistoryEntry = {
        presetId: preset.id,
        presetName: preset.name,
        at: Date.now(),
        lights: p.assignments.length,
        approximation: p.approximation,
      };
      store.addHistory(entry);
    });
  };

  const restorePrevious = () => {
    if (!previous) return;
    sound.click();
    startFade(previous.snaps as Record<string, Partial<Fixture>>);
    setResult(null);
    setPrevious(null);
  };

  const turnAllOff = () => {
    sound.click();
    const live = fixtures.filter((f) => reachOf(f) === 'live' || selected.has(f.id));
    setPrevious({ label: 'before TURN ALL OFF', snaps: Object.fromEntries(live.map((f) => [f.id, snapshotOf(f)])) });
    startFade(Object.fromEntries(live.map((f) => [f.id, { power: false, dimmer: f.dimmer }])));
  };

  const saveMyLighting = () => {
    const name = saveName.trim();
    if (!name) return;
    const source = selectedFixtures.filter((f) => f.power);
    if (!source.length) return;
    sound.click();
    const roleFor = (f: Fixture, i: number) => {
      const a = plan?.assignments.find((x) => x.fixtureId === f.id);
      if (a) return { role: a.light.role, position: a.light.position, modifier: a.light.modifier, distanceM: a.light.distanceM };
      const role = ROLE_ORDER[Math.min(i, ROLE_ORDER.length - 1)];
      return { role, position: DEFAULT_POSITION[role], modifier: '', distanceM: 2 };
    };
    const lights = source.map((f, i) => {
      const r = roleFor(f, i);
      return { ...lightFromFixture(f, r.role, r.position), modifier: r.modifier, distanceM: r.distanceM };
    });
    const custom: CinematicPreset = {
      id: newCustomId(),
      name,
      category: preset?.category ?? (CATEGORIES.some((c) => c.id === view) ? (view as CinematicCategory) : 'DRAMA'),
      inspiredBy: preset?.inspiredBy,
      description: `Saved from ${source.length} light(s)${preset ? `, based on "${preset.name}"` : ''}.`,
      ratio: preset?.ratio ?? '',
      minLights: lights.length,
      lights: [...lights].sort((a, b) => (a.role === 'KEY' ? -1 : b.role === 'KEY' ? 1 : 0)),
      custom: true,
    };
    store.saveCustom(custom);
    setSaveName('');
    setView('MINE');
    setPresetId(custom.id);
  };

  const duplicate = (p: CinematicPreset) => {
    sound.click();
    const copy: CinematicPreset = { ...p, id: newCustomId(), name: `${p.name} (copy)`, custom: true, lights: p.lights.map((l) => ({ ...l })) };
    store.saveCustom(copy);
    setView('MINE');
    setPresetId(copy.id);
  };

  const editLight = (index: number, changes: Partial<CinematicLight>) => {
    if (!preset?.custom) return;
    store.saveCustom({ ...preset, lights: preset.lights.map((l, i) => (i === index ? { ...l, ...changes } : l)) });
  };

  // ------------------------------------------------------------------ render

  const nameOf = (id: string) => {
    const f = fixtures.find((x) => x.id === id);
    return f ? `${f.tag} · ${f.name}` : id;
  };

  const sidebar = (
    <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0 shrink-0 lg:w-52">
      {CATEGORIES.map((c) => (
        <button key={c.id} onClick={() => { sound.tick(); setView(c.id); setPresetId(null); }} className={`whitespace-nowrap text-left ${chip(view === c.id)}`}>
          {c.label}
          <span className="ml-1 opacity-50">{allPresets.filter((p) => p.category === c.id).length}</span>
        </button>
      ))}
      <div className="hidden lg:block h-px bg-[#343840] my-2" />
      <button onClick={() => { setView('MINE'); setPresetId(null); }} className={`whitespace-nowrap text-left ${chip(view === 'MINE')}`}>
        MY CINEMATIC PRESETS <span className="opacity-50">{store.custom.length}</span>
      </button>
      <button onClick={() => { setView('FAVORITES'); setPresetId(null); }} className={`whitespace-nowrap text-left ${chip(view === 'FAVORITES')}`}>
        ★ FAVORITES <span className="opacity-50">{store.favorites.length}</span>
      </button>
      <button onClick={() => { setView('HISTORY'); setPresetId(null); }} className={`whitespace-nowrap text-left ${chip(view === 'HISTORY')}`}>
        HISTORY
      </button>
    </nav>
  );

  const grid = (
    <div className="flex-1 min-w-0">
      {view === 'HISTORY' ? (
        <div className="flex flex-col gap-1">
          {store.history.length === 0 && <div className="text-xs font-mono text-[#A4A8B1] p-6 text-center border border-dashed border-[#343840]">Nothing applied yet.</div>}
          {store.history.map((h, i) => (
            <button key={i} onClick={() => { setPresetId(h.presetId); setView(allPresets.find((p) => p.id === h.presetId)?.category ?? 'HOLLYWOOD'); }}
              className={`${card} flex items-center justify-between px-3 py-2 text-left hover:border-[#E5A962]`}>
              <span className="font-heading text-sm text-[#F3F0EA]">{h.presetName}</span>
              <span className="text-[10px] font-mono text-[#A4A8B1]">
                {h.lights} light(s){h.approximation ? ' · approx.' : ''} · {new Date(h.at).toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {presetsInView.length === 0 && (
            <div className="col-span-full text-xs font-mono text-[#A4A8B1] p-6 text-center border border-dashed border-[#343840]">
              {view === 'MINE' ? 'No saved looks yet. Open a look, adjust it, then SAVE MY LIGHTING.' : 'No favourites yet. Tap ★ on a look.'}
            </div>
          )}
          {presetsInView.map((p) => (
            <button key={p.id} onClick={() => { sound.tick(); setPresetId(p.id); }}
              className={`${card} text-left flex flex-col hover:border-[#E5A962] ${presetId === p.id ? '!border-[#E5A962]' : ''}`}>
              <div className="h-16 w-full relative" style={{ background: paletteGradient(p) }}>
                <div className="absolute inset-0 bg-gradient-to-t from-[#191B20] via-transparent to-transparent" />
                <span className="absolute top-1 right-1 text-[12px]" aria-label={store.favorites.includes(p.id) ? 'Favourite' : undefined}>
                  {store.favorites.includes(p.id) ? '★' : ''}
                </span>
              </div>
              <div className="p-2.5 flex flex-col gap-0.5">
                <span className="font-heading font-semibold text-[#F3F0EA] text-sm">{p.name}</span>
                <span className="text-[10px] font-mono text-[#E5A962] truncate">
                  {p.inspiredBy ? `INSPIRED BY ${p.inspiredBy.toUpperCase()}` : p.custom ? 'MY LOOK' : 'TECHNIQUE'}
                </span>
                <span className="text-[10px] font-mono text-[#A4A8B1]">
                  {p.lights.map((l) => l.role).join(' · ')} · min {p.minLights}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const detail = preset && plan && (
    <aside className="w-full lg:w-[440px] shrink-0 flex flex-col gap-3">
      {/* Header */}
      <div className={`${card} p-3 flex flex-col gap-2`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <button onClick={() => setPresetId(null)} className="lg:hidden flex items-center text-[10px] font-mono text-[#A4A8B1] mb-1">
              <ChevronLeft className="w-3 h-3" /> LOOKS
            </button>
            {renaming === preset.id ? (
              <input autoFocus defaultValue={preset.name}
                onBlur={(e) => { store.saveCustom({ ...preset, name: e.target.value.trim() || preset.name }); setRenaming(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                className="bg-[#101114] border border-[#E5A962] px-2 py-1 font-heading text-lg text-[#F3F0EA] w-full" />
            ) : (
              <h2 className="font-heading font-bold text-lg text-[#F3F0EA] leading-tight">{preset.name}</h2>
            )}
            <div className="text-[10px] font-mono text-[#E5A962]">
              {preset.inspiredBy ? `INSPIRED BY ${preset.inspiredBy.toUpperCase()}` : CATEGORIES.find((c) => c.id === preset.category)?.label}
              {preset.ratio && ` · ${preset.ratio}`} · MIN {preset.minLights} LIGHTS
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <button onClick={() => store.toggleFavorite(preset.id)} className={`${btn} border-[#343840] ${store.favorites.includes(preset.id) ? 'text-[#E5A962]' : 'text-[#A4A8B1]'}`} aria-label="Favourite">
              <Star className="w-3.5 h-3.5" fill={store.favorites.includes(preset.id) ? 'currentColor' : 'none'} />
            </button>
            <button onClick={() => duplicate(preset)} className={`${btn} border-[#343840] text-[#A4A8B1]`} aria-label="Duplicate"><Copy className="w-3.5 h-3.5" /></button>
            {preset.custom && (
              <>
                <button onClick={() => setRenaming(preset.id)} className={`${btn} border-[#343840] text-[#A4A8B1]`} aria-label="Rename"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => { store.deleteCustom(preset.id); setPresetId(null); }} className={`${btn} border-[#E56D6D]/50 text-[#E56D6D]`} aria-label="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
              </>
            )}
          </div>
        </div>
        <p className="text-[12px] text-[#A4A8B1] leading-snug">{preset.description}</p>
        {preset.inspiredBy && (
          <p className="text-[9px] font-mono text-[#6B7079]">An interpretation inspired by the film&apos;s look, not a reproduction of its original lighting.</p>
        )}
        <div className="flex h-2">{preset.lights.map((l, i) => <div key={i} className="flex-1" style={{ background: lightCss(l) }} />)}</div>
      </div>

      {/* Scheme */}
      <div className={`${card} p-3`}>
        <div className="text-[10px] font-mono font-bold tracking-widest text-[#A4A8B1] mb-2">LIGHTING SETUP</div>
        <LightingScheme
          lights={
            plan.assignments.length
              ? plan.assignments.map((a) => ({
                  key: `a-${a.fixtureId}-${a.roleIndexes[0]}`,
                  light: { ...a.light, intensity: a.updates.dimmer ?? a.light.intensity },
                  angle: a.angle,
                  label: a.label,
                  sublabel: fixtures.find((f) => f.id === a.fixtureId)?.tag,
                }))
              : preset.lights.map((l, i) => ({ key: `p-${i}`, light: l, label: l.role }))
          }
        />
      </div>

      {/* Light by light */}
      <div className={`${card} p-3 flex flex-col gap-2`}>
        <div className="text-[10px] font-mono font-bold tracking-widest text-[#A4A8B1]">LIGHTS IN THIS LOOK</div>
        {preset.lights.map((l, i) => (
          <div key={i} className="flex flex-col gap-1 border-t border-[#22252B] pt-2 first:border-0 first:pt-0">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 shrink-0" style={{ background: lightCss(l) }} />
              <span className="font-mono font-bold text-[11px] text-[#F3F0EA] w-24">{l.role}</span>
              <span className="text-[10px] font-mono text-[#A4A8B1] flex-1 truncate">
                {POSITION_LABEL[l.position]} · {l.distanceM} m · {l.colorMode === 'CCT' ? `${l.cct}K${l.tint ? ` ${l.tint > 0 ? '+' : ''}${l.tint}G` : ''}` : `H${l.hue}° S${l.saturation}%`}
              </span>
            </div>
            <div className="flex items-center gap-2 pl-5">
              <input type="range" min={0} max={100} value={intensities[i] ?? l.intensity}
                onChange={(e) => setIntensities((cur) => ({ ...cur, [i]: Number(e.target.value) }))}
                onPointerUp={(e) => editLight(i, { intensity: Number((e.target as HTMLInputElement).value) })}
                className="flex-1 accent-[#E5A962]" aria-label={`${l.role} intensity`} />
              <span className="font-mono text-[10px] text-[#F3F0EA] w-9 text-right">{intensities[i] ?? l.intensity}%</span>
            </div>
            {l.modifier && <div className="pl-5 text-[10px] text-[#6B7079]">{l.modifier}</div>}
          </div>
        ))}
      </div>

      {/* Your lights */}
      <div className={`${card} p-3 flex flex-col gap-2`}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono font-bold tracking-widest text-[#A4A8B1]">YOUR LIGHTS → ROLES</span>
          <span className="text-[10px] font-mono text-[#A4A8B1]">{liveCount} LIVE</span>
        </div>
        {fixtures.length === 0 && (
          <button onClick={onOpenPairing} className={`${btn} border-[#E5A962] text-[#E5A962]`}><Link2 className="w-3.5 h-3.5" /><span>PAIR A LIGHT</span></button>
        )}
        {liveCount === 0 && fixtures.length > 0 && (
          <div className="text-[11px] text-[#E6B45F] leading-snug">
            No light has a live link. Pair a real light to control it; simulated demo lights only change the console.
          </div>
        )}
        {fixtures.map((f) => {
          const r = reachOf(f);
          const a = plan.assignments.find((x) => x.fixtureId === f.id);
          const isSel = selected.has(f.id);
          const p = profileFor(f);
          return (
            <div key={f.id} className={`flex flex-col gap-1 border p-2 ${isSel ? 'border-[#343840] bg-[#14161B]' : 'border-transparent opacity-60'}`}>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={isSel} disabled={r === 'offline'}
                  onChange={(e) => setSelected((cur) => { const n = new Set(cur); if (e.target.checked) n.add(f.id); else n.delete(f.id); return n; })}
                  className="accent-[#E5A962]" aria-label={`Use ${f.tag}`} />
                <span className="font-mono font-bold text-[11px] text-[#F3F0EA]">{f.tag}</span>
                <span className="text-[10px] text-[#A4A8B1] truncate flex-1">{f.name} · {p.capability === 'FULL_COLOR' ? 'COLOUR' : p.capability === 'BICOLOR' ? 'BI-COLOUR' : 'DAYLIGHT'}</span>
                <span className={`text-[9px] font-mono px-1 border ${REACH_BADGE[r].cls}`}>{REACH_BADGE[r].text}</span>
              </div>
              {isSel && (
                <div className="flex items-center gap-2 pl-5">
                  <select value={f.id in overrides ? String(overrides[f.id]) : 'auto'}
                    onChange={(e) => setOverrides((cur) => {
                      const n = { ...cur };
                      if (e.target.value === 'auto') delete n[f.id];
                      else n[f.id] = e.target.value === 'none' ? null : Number(e.target.value);
                      return n;
                    })}
                    className="bg-[#101114] border border-[#343840] text-[10px] font-mono text-[#F3F0EA] px-1 py-0.5">
                    <option value="auto">AUTO{a ? ` (${a.label})` : ''}</option>
                    {preset.lights.map((l, i) => <option key={i} value={i}>{l.role} · {POSITION_LABEL[l.position]}</option>)}
                    <option value="none">LEAVE AS IS</option>
                  </select>
                  {a ? (
                    <span className="flex items-center gap-1 text-[10px] font-mono text-[#F3F0EA] min-w-0">
                      <span className="w-2.5 h-2.5 shrink-0" style={{ background: stateCss(a.updates) }} />
                      <span className="truncate">{stateText(a.updates)}</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-[#6B7079]">unchanged</span>
                  )}
                </div>
              )}
              {isSel && a?.notes.map((n, i) => (
                <div key={i} className={`pl-5 text-[10px] leading-snug ${a.approximated ? 'text-[#E6B45F]' : 'text-[#A4A8B1]'}`}>{n}</div>
              ))}
            </div>
          );
        })}
        {plan.warnings.length > 0 && (
          <div className="flex flex-col gap-1 border border-[#E6B45F]/40 bg-[#E6B45F]/5 p-2">
            {plan.warnings.map((w, i) => (
              <div key={i} className="flex gap-1.5 text-[11px] text-[#E6B45F] leading-snug"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{w}</div>
            ))}
          </div>
        )}
        {plan.approximation && plan.assignments.length > 0 && (
          <div className="text-[10px] font-mono text-[#E6B45F]">APPROXIMATION of the original scheme with the lights you have.</div>
        )}
      </div>

      {/* Transition + apply */}
      <div className={`${card} p-3 flex flex-col gap-3`}>
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] font-mono font-bold tracking-widest text-[#A4A8B1] mr-1">TRANSITION</span>
          {FADES.map((f) => (
            <button key={f.s} onClick={() => { setFadeS(f.s); setCustomFade(''); }} className={chip(!customFade && fadeS === f.s)}>{f.label}</button>
          ))}
          <input value={customFade} onChange={(e) => setCustomFade(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="custom s"
            className="w-20 bg-[#101114] border border-[#343840] px-2 py-1 text-[10px] font-mono text-[#F3F0EA]" aria-label="Custom fade in seconds" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => askApply('selected')} disabled={!plan.assignments.length}
            className={`${btn} bg-[#E5A962] border-[#E5A962] text-[#101114]`}><Check className="w-3.5 h-3.5" /><span>APPLY SELECTED</span></button>
          <button onClick={() => askApply('all')} disabled={liveCount === 0}
            className={`${btn} border-[#E5A962] text-[#E5A962]`}><Clapperboard className="w-3.5 h-3.5" /><span>APPLY ALL LIVE</span></button>
        </div>
        <div className="flex gap-2">
          <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Name this lighting"
            className="flex-1 min-w-0 bg-[#101114] border border-[#343840] px-2 py-1.5 text-[11px] font-mono text-[#F3F0EA]" />
          <button onClick={saveMyLighting} disabled={!saveName.trim() || !selectedFixtures.some((f) => f.power)}
            className={`${btn} border-[#343840] text-[#F3F0EA]`}><Save className="w-3.5 h-3.5" /><span>SAVE MY LIGHTING</span></button>
        </div>
        {result && (
          <div className="flex flex-col gap-1 border border-[#343840] p-2">
            <div className="text-[10px] font-mono font-bold text-[#F3F0EA]">{result.presetName.toUpperCase()}: RESULT</div>
            {result.rows.map((r) => (
              <div key={r.id} className={`text-[10px] font-mono ${r.ok ? 'text-[#52C98A]' : 'text-[#E6B45F]'}`}>
                {r.ok ? '✓' : '!'} {nameOf(r.id)}: {r.text}
              </div>
            ))}
            <div className="text-[9px] font-mono text-[#6B7079]">These protocols do not confirm delivery; check the lights on set.</div>
          </div>
        )}
        {preset.custom && <div className="text-[10px] font-mono text-[#6B7079]">Intensity changes on your own looks are saved when you release the slider.</div>}
      </div>
    </aside>
  );

  return (
    <div className="h-full flex flex-col p-3 sm:p-4 gap-3 overflow-y-auto">
      {/* Title bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clapperboard className="w-5 h-5 text-[#E5A962]" />
          <div>
            <h1 className="font-mono font-black tracking-widest text-sm text-[#F3F0EA]">CINEMATIC LIGHTING DIRECTOR</h1>
            <p className="text-[10px] font-mono text-[#6B7079]">Looks inspired by films and classic techniques, adapted to your lights.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={restorePrevious} disabled={!previous} className={`${btn} border-[#343840] text-[#F3F0EA]`} title={previous ? `Restore ${previous.label}` : undefined}>
            <RotateCcw className="w-3.5 h-3.5" /><span>RESTORE PREVIOUS</span>
          </button>
          <button onClick={turnAllOff} disabled={liveCount === 0 && selected.size === 0} className={`${btn} border-[#E56D6D]/60 text-[#E56D6D]`}>
            <Power className="w-3.5 h-3.5" /><span>TURN ALL OFF</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 min-h-0">
        <div className={`${preset ? 'hidden lg:flex' : 'flex'} flex-col lg:flex-row gap-3 flex-1 min-w-0`}>
          {sidebar}
          {grid}
        </div>
        {detail}
      </div>

      {/* Confirm */}
      {confirm && preset && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setConfirm(null)}>
          <div role="dialog" aria-label="Confirm lighting changes" onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-[#191B20] border border-[#E5A962] p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="font-mono font-black text-sm tracking-widest text-[#F3F0EA]">APPLY “{preset.name.toUpperCase()}”?</span>
              <button onClick={() => setConfirm(null)} aria-label="Cancel" className="text-[#A4A8B1]"><X className="w-4 h-4" /></button>
            </div>
            <div className="text-[10px] font-mono text-[#A4A8B1]">
              {confirm.scope === 'all' ? 'All live lights' : 'Selected lights'} · transition {fadeMs ? `${fadeMs / 1000}s` : 'cut'}
            </div>
            {confirm.plan.assignments.length === 0 && <div className="text-xs text-[#E6B45F]">No light to change.</div>}
            {confirm.plan.assignments.map((a) => {
              const f = fixtures.find((x) => x.id === a.fixtureId)!;
              const r = reachOf(f);
              return (
                <div key={a.fixtureId} className="flex flex-col gap-0.5 border-t border-[#22252B] pt-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[11px] text-[#F3F0EA]">{f.tag}</span>
                    <span className="text-[10px] font-mono text-[#E5A962]">{a.label}</span>
                    <span className={`ml-auto text-[9px] font-mono px-1 border ${REACH_BADGE[r].cls}`}>{REACH_BADGE[r].text}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-[#A4A8B1]">
                    <span className="w-2.5 h-2.5" style={{ background: stateCss(f) }} />{stateText(f)}
                    <span className="text-[#6B7079]">→</span>
                    <span className="w-2.5 h-2.5" style={{ background: stateCss(a.updates) }} /><span className="text-[#F3F0EA]">{stateText(a.updates)}</span>
                  </div>
                </div>
              );
            })}
            {confirm.plan.warnings.map((w, i) => <div key={i} className="text-[11px] text-[#E6B45F]">{w}</div>)}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setConfirm(null)} className={`${btn} border-[#343840] text-[#F3F0EA]`}>CANCEL</button>
              <button onClick={doApply} disabled={!confirm.plan.assignments.length} className={`${btn} bg-[#E5A962] border-[#E5A962] text-[#101114]`}>
                <Check className="w-3.5 h-3.5" /><span>CONFIRM</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
