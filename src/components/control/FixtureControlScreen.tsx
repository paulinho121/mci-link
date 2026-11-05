import React, { useEffect, useMemo, useState } from 'react';
import { Fixture, FxPreset, GelPreset, LookPreset } from '../../types/cine';
import { profileFor } from '../../data/fixtureProfiles';
import { BUILT_IN_LOOKS, USER_SLOT_COUNT } from '../../data/lookPresets';
import { DRIVERS, TRANSPORT_LABELS, encodeDmx } from '../../services/lightLink';
import { FX_TO_SIDUS_EFFECT } from '../../services/sidus/driver';
import { kelvinToRgb } from '../../utils/kelvinToRgb';
import { D65, GAMUTS, GamutId, XY, clampToGamut, fixtureSwatch } from '../../utils/color';
import { sound } from '../../utils/soundEffects';
import { VerticalFader } from './VerticalFader';
import { DimmingCurvePicker } from './DimmingCurvePicker';
import { HueWheel } from './HueWheel';
import { CieDiagram } from './CieDiagram';
import {
  ChevronLeft, MoreVertical, Battery, Plug, Plus, Sun, Palette, Aperture, Layers, Zap, Bookmark,
  Crosshair, RefreshCw, Unlink, Power, Minus, Save, Square, List, SlidersHorizontal,
} from 'lucide-react';

type Target = { kind: 'fixture'; id: string } | { kind: 'group'; group: number } | { kind: 'all' };
type Tab = 'WHITE' | 'HSI' | 'XY' | 'SOURCE' | 'EFFECT';
type MobileView = 'fixtures' | 'controls' | 'presets';

interface FixtureControlScreenProps {
  fixtures: Fixture[];
  /** Final output level per fixture id (after curve, GM, blackout…). */
  outputLevels: Record<string, number>;
  selectedFixtureId: string;
  onSelectFixture: (id: string) => void;
  onUpdateFixtures: (ids: string[], updates: Partial<Fixture>) => void;
  fxList: FxPreset[];
  onUpdateFxPreset: (id: string, updates: Partial<FxPreset>) => void;
  gels: GelPreset[];
  identifyingId: string | null;
  onIdentify: (id: string) => void;
  onReconnect: (id: string) => void;
  onUnpair: (id: string) => void;
  onOpenPairing: () => void;
  userPresets: (LookPreset | null)[];
  onSaveUserPreset: (slot: number, preset: LookPreset) => void;
  onClose: () => void;
}

const TABS: { id: Tab; label: string; icon: React.ElementType; fullColorOnly?: boolean }[] = [
  { id: 'WHITE', label: 'WHITE', icon: Sun },
  { id: 'HSI', label: 'HSI', icon: Palette, fullColorOnly: true },
  { id: 'XY', label: 'COLOR XY', icon: Aperture, fullColorOnly: true },
  { id: 'SOURCE', label: 'SOURCE', icon: Layers, fullColorOnly: true },
  { id: 'EFFECT', label: 'EFFECT', icon: Zap },
];

const tabForMode = (f: Fixture): Tab =>
  f.colorMode === 'HSI' ? 'HSI' : f.colorMode === 'XY' ? 'XY' : f.colorMode === 'GEL' ? 'SOURCE' : 'WHITE';

const chip = (active: boolean) =>
  `border font-mono font-bold ${active ? 'bg-[#E5A962] text-[#101114] border-[#E5A962]' : 'bg-[#191B20] text-[#F3F0EA] border-[#343840] hover:border-[#E5A962]'}`;

/** Horizontal intensity row with power toggle (HSI / XY / SOURCE tabs). */
const IntensityBar: React.FC<{ fixture: Fixture; onUpdate: (u: Partial<Fixture>) => void }> = ({ fixture, onUpdate }) => (
  <div className="flex flex-col space-y-1.5 w-full">
    <div className="flex items-center justify-between">
      <span className="font-mono text-xs text-[#A4A8B1] tracking-widest">
        INT <span className="text-[#E5A962] font-black text-sm ml-1">{fixture.dimmer.toFixed(0)}%</span>
      </span>
      <button
        role="switch"
        aria-checked={fixture.power}
        aria-label="Power"
        onClick={() => { sound.click(); onUpdate({ power: !fixture.power }); }}
        className={`w-11 h-5 border relative ${fixture.power ? 'bg-[#52C98A]/20 border-[#52C98A]' : 'bg-[#14161B] border-[#343840]'}`}
      >
        <span className={`absolute top-0.5 w-4 h-3.5 transition-all ${fixture.power ? 'left-[22px] bg-[#52C98A]' : 'left-0.5 bg-[#A4A8B1]'}`} />
      </button>
    </div>
    <div className="flex items-center space-x-2">
      <button aria-label="Intensity down" onClick={() => { sound.tick(); onUpdate({ dimmer: Math.max(0, fixture.dimmer - 1) }); }} className="p-1 border border-[#343840] text-[#A4A8B1] hover:text-[#E5A962]">
        <Minus className="w-3 h-3" />
      </button>
      <input
        type="range"
        min={0}
        max={100}
        step={0.1}
        value={fixture.dimmer}
        aria-label="Intensity"
        onChange={(e) => onUpdate({ dimmer: Number(e.target.value) })}
        className="flex-1 accent-[#E5A962]"
      />
      <button aria-label="Intensity up" onClick={() => { sound.tick(); onUpdate({ dimmer: Math.min(100, fixture.dimmer + 1) }); }} className="p-1 border border-[#343840] text-[#A4A8B1] hover:text-[#E5A962]">
        <Plus className="w-3 h-3" />
      </button>
    </div>
  </div>
);

const HSlider: React.FC<{ label: string; value: number; min: number; max: number; step: number; display: string; onChange: (v: number) => void }> = ({
  label, value, min, max, step, display, onChange,
}) => (
  <label className="flex flex-col space-y-1">
    <div className="flex items-center justify-between text-[10px] font-mono">
      <span className="text-[#A4A8B1] tracking-widest">{label}</span>
      <span className="text-[#F3F0EA] font-bold">{display}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#E5A962]" aria-label={label} />
  </label>
);

export const FixtureControlScreen: React.FC<FixtureControlScreenProps> = ({
  fixtures,
  outputLevels,
  selectedFixtureId,
  onSelectFixture,
  onUpdateFixtures,
  fxList,
  onUpdateFxPreset,
  gels,
  identifyingId,
  onIdentify,
  onReconnect,
  onUnpair,
  onOpenPairing,
  userPresets,
  onSaveUserPreset,
  onClose,
}) => {
  const [target, setTarget] = useState<Target>({ kind: 'fixture', id: selectedFixtureId });
  const [mobileView, setMobileView] = useState<MobileView>('controls');
  const [showPresets, setShowPresets] = useState(false);
  const [gamut, setGamut] = useState<GamutId>('NATIVE');
  const [fxTrigger, setFxTrigger] = useState<'LATCH' | 'FLASH'>('LATCH');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmUnpair, setConfirmUnpair] = useState<string | null>(null);

  // Follow selection changes coming from outside (e.g. Fader Bay CONTROL buttons).
  useEffect(() => {
    setTarget((t) => (t.kind === 'fixture' ? { kind: 'fixture', id: selectedFixtureId } : t));
  }, [selectedFixtureId]);

  const targetFixtures = useMemo(() => {
    if (target.kind === 'all') return fixtures;
    if (target.kind === 'group') return fixtures.filter((f) => f.group === target.group);
    return fixtures.filter((f) => f.id === target.id);
  }, [fixtures, target]);
  const targetIds = targetFixtures.map((f) => f.id);

  const lead =
    targetFixtures.find((f) => f.id === selectedFixtureId) ?? targetFixtures[0] ?? fixtures.find((f) => f.id === selectedFixtureId) ?? fixtures[0];

  const [tab, setTab] = useState<Tab>(lead ? tabForMode(lead) : 'WHITE');
  const [fxParamId, setFxParamId] = useState<string>(lead?.activeFxId ?? fxList[0]?.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!lead) return null;

  const profile = profileFor(lead);
  const fullColor = targetFixtures.some((f) => profileFor(f).capability === 'FULL_COLOR');
  const activeTab: Tab = TABS.find((t) => t.id === tab)?.fullColorOnly && !fullColor ? 'WHITE' : tab;
  const update = (u: Partial<Fixture>) => onUpdateFixtures(targetIds, u);
  const groups = [...new Set(fixtures.map((f) => f.group))].sort((a, b) => a - b);
  const gelHex = gels.find((g) => `${g.code} ${g.name}` === lead.gelName)?.hex;
  const leadSwatch = fixtureSwatch(lead, gelHex);
  const xy: XY = lead.xy ?? D65;

  const targetTitle =
    target.kind === 'all' ? 'ALL FIXTURES' : target.kind === 'group' ? `GROUP ${String(target.group).padStart(2, '0')}` : lead.tag;
  const targetSub =
    target.kind === 'fixture' ? lead.name : `${targetFixtures.length} fixtures · showing ${lead.tag}`;

  const selectTab = (t: Tab) => {
    sound.click();
    setTab(t);
    if (t === 'WHITE' && lead.colorMode !== 'CCT') update({ colorMode: 'CCT', gelName: undefined });
    if (t === 'HSI' && lead.colorMode !== 'HSI') update({ colorMode: 'HSI', ...(lead.saturation === 0 ? { saturation: 100 } : {}) });
    if (t === 'XY' && lead.colorMode !== 'XY') update({ colorMode: 'XY', xy: clampToGamut(xy, GAMUTS[gamut].points) });
  };

  const selectFixture = (id: string) => {
    sound.click();
    onSelectFixture(id);
    setTarget({ kind: 'fixture', id });
    setMobileView('controls');
  };

  const snapshotLook = (slot: number): LookPreset => ({
    id: `user-${slot}`,
    label: `C${slot + 1}`,
    swatch: leadSwatch,
    values: {
      dimmer: lead.dimmer,
      cct: lead.cct,
      tint: lead.tint,
      colorMode: lead.colorMode,
      hue: lead.hue,
      saturation: lead.saturation,
      xy: lead.xy,
      gelName: lead.gelName,
      activeFxId: lead.activeFxId,
    },
  });

  const recall = (p: LookPreset) => {
    sound.click();
    update(p.values);
    setTab(tabForMode({ ...lead, ...p.values } as Fixture));
  };

  const triggerFx = (fxId: string, on: boolean) => {
    setFxParamId(fxId);
    update({ activeFxId: on ? fxId : undefined });
  };

  // Parameters follow the running effect; otherwise the last tile touched.
  const fxParam = fxList.find((f) => f.id === (lead.activeFxId ?? fxParamId)) ?? fxList[0];
  const cctPresets = [3200, 4300, 5600, 6500];

  // ---------- pieces ----------

  const userSlots = (big: boolean) => (
    <div className={`grid grid-cols-4 ${big ? 'gap-2' : 'gap-1'}`}>
      {Array.from({ length: USER_SLOT_COUNT }, (_, i) => {
        const p = userPresets[i];
        return (
          <div key={i} className="flex flex-col">
            <button
              onClick={() => (p ? recall(p) : (sound.click(), onSaveUserPreset(i, snapshotLook(i))))}
              title={p ? `Recall C${i + 1}` : `Store current look in C${i + 1}`}
              className={`${big ? 'h-14' : 'h-7 w-12'} border flex items-center justify-center font-mono font-black text-xs ${
                p ? 'border-[#343840] text-[#101114]' : 'border-dashed border-[#343840] text-[#A4A8B1] hover:border-[#E5A962]'
              }`}
              style={p ? { backgroundColor: p.swatch } : undefined}
            >
              {p ? `C${i + 1}` : big ? `+ C${i + 1}` : `C${i + 1}`}
            </button>
            {big && p && (
              <button
                onClick={() => { sound.click(); onSaveUserPreset(i, snapshotLook(i)); }}
                className="mt-1 flex items-center justify-center space-x-1 text-[9px] font-mono text-[#A4A8B1] hover:text-[#E5A962]"
              >
                <Save className="w-2.5 h-2.5" />
                <span>OVERWRITE</span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  const presetsPanel = (
    <div className="flex flex-col space-y-4 p-3 overflow-y-auto h-full">
      <div>
        <div className="text-[10px] font-mono font-bold tracking-widest text-[#A4A8B1] mb-2">MEMORY · TAP EMPTY SLOT TO STORE</div>
        {userSlots(true)}
      </div>
      <div>
        <div className="text-[10px] font-mono font-bold tracking-widest text-[#A4A8B1] mb-2">LOOKS</div>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 gap-2">
          {BUILT_IN_LOOKS.map((p) => (
            <button key={p.id} onClick={() => recall(p)} className="flex flex-col border border-[#343840] hover:border-[#E5A962] bg-[#191B20]">
              <span className="h-12 w-full relative" style={{ backgroundColor: p.swatch }}>
                {p.values.activeFxId && <Zap className="absolute top-1 right-1 w-3 h-3 text-[#101114]" />}
              </span>
              <span className="px-1.5 py-1 text-[10px] font-mono font-bold text-[#F3F0EA] text-left">{p.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const fixtureList = (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 pt-3 pb-1 text-[10px] font-mono font-bold tracking-widest text-[#A4A8B1]">FIXTURES</div>
      {fixtures.map((f) => {
        const active = target.kind === 'fixture' && target.id === f.id;
        const inTarget = targetIds.includes(f.id);
        const lost = f.link?.status === 'lost';
        return (
          <div
            key={f.id}
            className={`relative flex items-center mx-2 mb-1 border ${
              active ? 'bg-[#22252B] border-[#E5A962]' : inTarget ? 'bg-[#1E2026] border-[#343840]' : 'border-transparent hover:bg-[#1E2026]'
            }`}
          >
            <button onClick={() => selectFixture(f.id)} className="flex-1 flex items-center space-x-2.5 px-2 py-2 text-left min-w-0">
              <span
                className={`w-2.5 h-2.5 flex-shrink-0 ${lost ? 'bg-[#E56D6D]' : f.power ? 'bg-[#52C98A]' : 'bg-[#343840]'}`}
                aria-label={lost ? 'link lost' : f.power ? 'on' : 'off'}
              />
              <span className="flex flex-col min-w-0">
                <span className="flex items-center space-x-1.5">
                  <span className="text-xs font-mono font-black text-[#E5A962]">{f.tag}</span>
                  {identifyingId === f.id && <span className="text-[9px] font-mono text-[#E6B45F] animate-pulse">IDENT</span>}
                </span>
                <span className="text-[11px] font-heading text-[#F3F0EA] truncate">{f.name}</span>
              </span>
            </button>
            <span className="flex flex-col items-end mr-1 text-[9px] font-mono text-[#A4A8B1] flex-shrink-0">
              <span className="flex items-center space-x-1">
                {f.battery !== undefined ? <Battery className="w-3 h-3" /> : <Plug className="w-3 h-3" />}
                <span>{f.battery !== undefined ? `${f.battery}%` : 'AC'}</span>
              </span>
              <span>{(outputLevels[f.id] ?? 0).toFixed(0)}%</span>
            </span>
            <button
              onClick={() => { sound.click(); setMenuFor(menuFor === f.id ? null : f.id); setConfirmUnpair(null); }}
              className="p-2 text-[#A4A8B1] hover:text-[#F3F0EA]"
              aria-label={`${f.tag} options`}
              aria-expanded={menuFor === f.id}
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {menuFor === f.id && (
              <div className="absolute right-1 top-full z-20 w-44 bg-[#14161B] border border-[#E5A962] shadow-xl flex flex-col">
                <div className="px-2.5 py-1.5 border-b border-[#343840] text-[9px] font-mono text-[#A4A8B1]">
                  {f.link ? `${TRANSPORT_LABELS[f.link.transport]} · ${f.link.status.toUpperCase()}${f.link.transport === 'SIDUS' ? '' : ` · ${f.rssi} dBm`}` : 'NOT LINKED'}
                </div>
                <button onClick={() => { sound.click(); onIdentify(f.id); setMenuFor(null); }} className="flex items-center space-x-2 px-2.5 py-2 text-xs font-mono text-[#F3F0EA] hover:bg-[#22252B]">
                  <Crosshair className="w-3.5 h-3.5" /><span>IDENTIFY</span>
                </button>
                <button onClick={() => { sound.click(); onReconnect(f.id); setMenuFor(null); }} className="flex items-center space-x-2 px-2.5 py-2 text-xs font-mono text-[#F3F0EA] hover:bg-[#22252B]">
                  <RefreshCw className="w-3.5 h-3.5" /><span>RECONNECT</span>
                </button>
                <button
                  onClick={() => {
                    sound.click();
                    if (confirmUnpair === f.id) { setMenuFor(null); onUnpair(f.id); }
                    else setConfirmUnpair(f.id);
                  }}
                  className={`flex items-center space-x-2 px-2.5 py-2 text-xs font-mono ${confirmUnpair === f.id ? 'bg-[#E56D6D] text-[#101114]' : 'text-[#E56D6D] hover:bg-[#22252B]'}`}
                >
                  <Unlink className="w-3.5 h-3.5" /><span>{confirmUnpair === f.id ? 'CONFIRM UNPAIR' : 'UNPAIR'}</span>
                </button>
              </div>
            )}
          </div>
        );
      })}
      <button
        onClick={() => { sound.click(); onOpenPairing(); }}
        className="mx-2 mb-2 mt-1 flex items-center justify-center space-x-1.5 py-2 border border-dashed border-[#343840] text-[#A4A8B1] hover:border-[#E5A962] hover:text-[#E5A962] text-xs font-mono font-bold"
      >
        <Plus className="w-3.5 h-3.5" /><span>PAIR LIGHT</span>
      </button>

      <div className="px-3 pt-3 pb-1 text-[10px] font-mono font-bold tracking-widest text-[#A4A8B1]">GROUPS</div>
      {[{ key: 'all', label: 'ALL FIXTURES', count: fixtures.length, t: { kind: 'all' } as Target },
        ...groups.map((g) => ({ key: `g${g}`, label: `GROUP ${String(g).padStart(2, '0')}`, count: fixtures.filter((f) => f.group === g).length, t: { kind: 'group', group: g } as Target })),
      ].map((g) => {
        const active = target.kind === g.t.kind && (g.t.kind !== 'group' || (target.kind === 'group' && target.group === g.t.group));
        return (
          <button
            key={g.key}
            onClick={() => { sound.click(); setTarget(g.t); setMobileView('controls'); }}
            className={`mx-2 mb-1 flex items-center justify-between px-2 py-2 border text-left ${active ? 'bg-[#22252B] border-[#E5A962]' : 'border-transparent hover:bg-[#1E2026]'}`}
          >
            <span className="flex items-center space-x-2.5">
              <span className="w-2.5 h-2.5 border border-[#A4A8B1]" />
              <span className="text-xs font-mono font-bold text-[#F3F0EA]">{g.label}</span>
            </span>
            <span className="text-[10px] font-mono text-[#A4A8B1]">{g.count}</span>
          </button>
        );
      })}
    </div>
  );

  const whiteTab = (
    <div className="flex flex-wrap justify-center gap-x-6 gap-y-6 h-full min-h-0 content-start md:content-stretch">
      <div className="flex space-x-4 sm:space-x-8 h-[360px] md:h-full">
        <VerticalFader label="INT" value={lead.dimmer} min={0} max={100} step={0.1} nudge={1} format={(v) => `${v.toFixed(0)}%`} onChange={(dimmer) => update({ dimmer })} />
        <VerticalFader
          label="CCT"
          value={lead.cct}
          min={profile.cctMin}
          max={Math.max(profile.cctMax, profile.cctMin + 1)}
          step={50}
          nudge={100}
          format={(v) => `${Math.round(v)}K`}
          onChange={(cct) => update({ cct, colorMode: 'CCT', gelName: undefined })}
          trackBackground={`linear-gradient(to top, ${kelvinToRgb(profile.cctMin).hex}55, ${kelvinToRgb(profile.cctMax).hex}55)`}
          disabled={profile.cctMin === profile.cctMax}
        />
        <VerticalFader
          label="G/M"
          value={lead.tint}
          min={-1}
          max={1}
          step={0.01}
          nudge={0.05}
          format={(v) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2))}
          onChange={(tint) => update({ tint })}
          trackBackground="linear-gradient(to top, rgba(229,109,200,0.35), rgba(20,22,27,1) 50%, rgba(113,231,165,0.35))"
          disabled={!profile.supportsTint}
        />
      </div>
      <div className="flex flex-row md:flex-col items-start md:items-center gap-6 md:pt-8">
        <DimmingCurvePicker value={lead.dimmingCurve ?? 'LINEAR'} onChange={(dimmingCurve) => update({ dimmingCurve })} />
        <div className="grid grid-cols-2 gap-1.5">
          {cctPresets.map((k) => {
            const reachable = k >= profile.cctMin && k <= profile.cctMax;
            return (
              <button
                key={k}
                disabled={!reachable}
                onClick={() => { sound.click(); update({ cct: k, colorMode: 'CCT', gelName: undefined }); }}
                className={`w-16 h-12 text-xs disabled:opacity-30 ${chip(lead.colorMode === 'CCT' && lead.cct === k)}`}
              >
                {k}K
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  const hsiTab = (
    <div className="flex flex-col items-center space-y-4 max-w-md mx-auto w-full">
      <IntensityBar fixture={lead} onUpdate={update} />
      <HueWheel hue={lead.hue} saturation={lead.saturation} onChange={(hue, saturation) => update({ hue, saturation, colorMode: 'HSI' })} />
      <div className="w-full grid grid-cols-2 gap-3">
        <HSlider label="HUE" value={lead.hue} min={0} max={360} step={1} display={`${lead.hue}°`} onChange={(hue) => update({ hue, colorMode: 'HSI' })} />
        <HSlider label="SAT" value={lead.saturation} min={0} max={100} step={1} display={`${lead.saturation}%`} onChange={(saturation) => update({ saturation, colorMode: 'HSI' })} />
      </div>
    </div>
  );

  const xyTab = (
    <div className="flex flex-col items-center space-y-3 max-w-md mx-auto w-full">
      <IntensityBar fixture={lead} onUpdate={update} />
      <div className="w-full flex items-center space-x-2">
        <span className="w-12 h-7 border border-[#343840]" style={{ backgroundColor: leadSwatch }} />
        {(['x', 'y'] as const).map((axis) => (
          <label key={axis} className="flex items-center space-x-1 bg-[#101114] border border-[#343840] px-2 py-1">
            <span className="text-[10px] font-mono text-[#A4A8B1] uppercase">{axis}:</span>
            <input
              type="number"
              step={0.001}
              min={0}
              max={0.9}
              value={xy[axis]}
              onChange={(e) => {
                const next = { ...xy, [axis]: Number(e.target.value) || 0 };
                update({ colorMode: 'XY', xy: clampToGamut(next, GAMUTS[gamut].points) });
              }}
              className="w-16 bg-transparent font-mono text-xs text-[#F3F0EA] outline-none"
            />
          </label>
        ))}
      </div>
      <div className="w-full flex items-start space-x-2">
        <CieDiagram value={xy} gamut={gamut} onChange={(p) => update({ colorMode: 'XY', xy: p })} />
        <div className="flex flex-col space-y-1.5" role="radiogroup" aria-label="Gamut">
          {(Object.keys(GAMUTS) as GamutId[]).map((g) => (
            <button
              key={g}
              role="radio"
              aria-checked={gamut === g}
              onClick={() => {
                sound.click();
                setGamut(g);
                if (lead.colorMode === 'XY') update({ xy: clampToGamut(xy, GAMUTS[g].points) });
              }}
              className={`px-2 py-1 text-[10px] whitespace-nowrap ${chip(gamut === g)}`}
            >
              {GAMUTS[g].label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const sourceTab = (
    <div className="flex flex-col space-y-3 max-w-xl mx-auto w-full">
      <IntensityBar fixture={lead} onUpdate={update} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {gels.map((g) => {
          const name = `${g.code} ${g.name}`;
          const on = lead.colorMode === 'GEL' && lead.gelName === name;
          return (
            <button
              key={g.id}
              onClick={() => { sound.click(); update({ colorMode: 'GEL', gelName: name }); }}
              className={`flex items-center space-x-2 p-2 border text-left ${on ? 'border-[#E5A962] bg-[#22252B]' : 'border-[#343840] hover:border-[#A4A8B1]'}`}
            >
              <span className="w-6 h-6 flex-shrink-0 border border-[#343840]" style={{ backgroundColor: g.hex }} />
              <span className="flex flex-col min-w-0">
                <span className="text-[11px] font-mono font-bold text-[#F3F0EA] truncate">{name}</span>
                <span className="text-[9px] font-mono text-[#A4A8B1] truncate">{g.category}{g.cctShift ? ` · ${g.cctShift}` : ''}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const effectTab = (
    <div className="flex flex-col space-y-3 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-2 w-44" role="radiogroup" aria-label="Trigger mode">
          {(['LATCH', 'FLASH'] as const).map((m) => (
            <button key={m} role="radio" aria-checked={fxTrigger === m} onClick={() => { sound.click(); setFxTrigger(m); }} className={`py-1 text-[10px] ${chip(fxTrigger === m)}`}>
              {m}
            </button>
          ))}
        </div>
        <button
          onClick={() => { sound.click(); update({ activeFxId: undefined }); }}
          disabled={!targetFixtures.some((f) => f.activeFxId)}
          className="flex items-center space-x-1 px-2 py-1 border border-[#E56D6D] text-[#E56D6D] text-[10px] font-mono font-bold disabled:opacity-30"
        >
          <Square className="w-3 h-3" /><span>STOP FX</span>
        </button>
      </div>
      <div className="text-[10px] font-mono text-[#A4A8B1]">
        {fxTrigger === 'LATCH' ? 'Latch: the effect stays on until you tap it again.' : 'Flash: the effect runs only while the tile is held.'}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {fxList.map((fx) => {
          const on = lead.activeFxId === fx.id;
          return (
            <button
              key={fx.id}
              onClick={fxTrigger === 'LATCH' ? () => { sound.click(); triggerFx(fx.id, !on); } : undefined}
              onPointerDown={fxTrigger === 'FLASH' ? () => { sound.click(); triggerFx(fx.id, true); } : undefined}
              onPointerUp={fxTrigger === 'FLASH' ? () => triggerFx(fx.id, false) : undefined}
              onPointerLeave={fxTrigger === 'FLASH' && on ? () => triggerFx(fx.id, false) : undefined}
              className={`flex flex-col items-start p-2 border text-left touch-none ${
                on ? 'bg-[#E6B45F] border-[#E6B45F] text-[#101114]' : fxParam?.id === fx.id ? 'border-[#E6B45F] text-[#F3F0EA]' : 'border-[#343840] text-[#F3F0EA] hover:border-[#E6B45F]'
              }`}
            >
              <span className="flex items-center space-x-1 text-[11px] font-mono font-black"><Zap className="w-3 h-3" /><span>{fx.name}</span></span>
              <span className={`text-[9px] font-mono ${on ? 'text-[#101114]/80' : 'text-[#A4A8B1]'}`}>{fx.description}</span>
            </button>
          );
        })}
      </div>
      {fxParam && (
        <div className="border border-[#343840] bg-[#191B20] p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold tracking-widest text-[#A4A8B1]">EFFECT PARAMETERS</span>
            <span className="text-xs font-mono font-bold text-[#E6B45F]">{fxParam.name}</span>
          </div>
          <HSlider label="DEPTH" value={fxParam.depth} min={10} max={100} step={1} display={`${fxParam.depth}%`} onChange={(depth) => onUpdateFxPreset(fxParam.id, { depth })} />
          <HSlider label="SPEED" value={fxParam.frequency} min={0.5} max={30} step={0.1} display={`${fxParam.frequency.toFixed(1)} Hz`} onChange={(frequency) => onUpdateFxPreset(fxParam.id, { frequency })} />
          <div className="text-[9px] font-mono text-[#A4A8B1]">Parameters are shared by every fixture running this effect.</div>
          {lead.link?.transport === 'SIDUS' && (
            <div className="text-[9px] font-mono text-[#E6B45F]">
              {lead.capabilities?.effects.includes(FX_TO_SIDUS_EFFECT[fxParam.id] ?? '')
                ? 'This amaran light runs the effect itself. Depth and speed are set on the light, not here.'
                : 'This amaran light has no matching built-in effect, so the console animates the intensity instead (max 5 updates/s).'}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const frame = encodeDmx(lead, outputLevels[lead.id] ?? 0);
  const isDmx = lead.link && lead.link.transport !== 'BLE';

  const controls = (
    <div className="flex flex-col h-full min-h-0">
      {/* Mode tabs */}
      <div className="flex items-center justify-between border-b border-[#343840] bg-[#14161B] px-2">
        <div className="flex overflow-x-auto" role="tablist">
          {TABS.map((t) => {
            const disabled = t.fullColorOnly && !fullColor;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={activeTab === t.id}
                disabled={disabled}
                onClick={() => selectTab(t.id)}
                className={`flex flex-col items-center px-3 sm:px-4 py-2 border-b-2 text-[10px] font-mono font-bold tracking-wider disabled:opacity-25 whitespace-nowrap ${
                  activeTab === t.id ? 'border-[#E5A962] text-[#E5A962]' : 'border-transparent text-[#A4A8B1] hover:text-[#F3F0EA]'
                }`}
              >
                <Icon className="w-4 h-4 mb-0.5" />
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="hidden lg:block">{userSlots(false)}</div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {activeTab === 'WHITE' && whiteTab}
        {activeTab === 'HSI' && hsiTab}
        {activeTab === 'XY' && xyTab}
        {activeTab === 'SOURCE' && sourceTab}
        {activeTab === 'EFFECT' && effectTab}
      </div>

      {/* Output strip */}
      <div className="hidden sm:flex items-center space-x-3 px-3 py-1.5 border-t border-[#343840] bg-[#14161B] text-[10px] font-mono text-[#A4A8B1] overflow-x-auto">
        <span className="whitespace-nowrap">
          OUT <span className="text-[#E5A962] font-bold">{(outputLevels[lead.id] ?? 0).toFixed(1)}%</span>
        </span>
        <span className="whitespace-nowrap">{isDmx ? `U${lead.universe}:${lead.startAddress} · ${profile.dmxMode.name}` : lead.link ? TRANSPORT_LABELS[lead.link.transport] : 'NOT LINKED'}</span>
        <span className="flex space-x-1">
          {profile.dmxMode.channels.map((ch, i) => (
            <span key={ch} className="px-1 bg-[#101114] border border-[#343840] whitespace-nowrap" title={ch}>
              {ch.replace('_FINE', '.F')} <span className="text-[#F3F0EA]">{frame[i]}</span>
            </span>
          ))}
        </span>
        {lead.link && DRIVERS[lead.link.transport].simulated && <span className="text-[#E6B45F] whitespace-nowrap">SIMULATED LINK</span>}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-x-0 top-0 bottom-16 z-40 bg-[#101114] flex flex-col" role="dialog" aria-label="Fixture control">
      {menuFor && <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between px-2 sm:px-3 h-14 border-b border-[#343840] bg-[#191B20] flex-shrink-0">
        <div className="flex items-center space-x-2 min-w-0">
          <button onClick={() => { sound.click(); onClose(); }} className="p-1.5 text-[#A4A8B1] hover:text-[#E5A962]" aria-label="Back to console">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="w-8 h-8 flex-shrink-0 border border-[#343840]" style={{ backgroundColor: leadSwatch, opacity: Math.max(0.2, (outputLevels[lead.id] ?? 0) / 100) }} />
          <div className="flex flex-col min-w-0">
            <span className="font-mono font-black text-sm sm:text-base text-[#F3F0EA] tracking-wider truncate">{targetTitle}</span>
            <span className="text-[10px] font-mono text-[#A4A8B1] truncate">{targetSub}</span>
          </div>
          {lead.link && target.kind === 'fixture' && (
            <span
              className={`hidden sm:inline-flex items-center space-x-1 px-1.5 py-0.5 border text-[9px] font-mono font-bold ${
                lead.link.status === 'connected' ? 'text-[#52C98A] border-[#52C98A]/50' : lead.link.status === 'connecting' ? 'text-[#E6B45F] border-[#E6B45F]/50' : 'text-[#E56D6D] border-[#E56D6D]/50'
              }`}
            >
              {TRANSPORT_LABELS[lead.link.transport]} · {lead.link.status.toUpperCase()}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3">
          <label className="flex items-center space-x-1.5 cursor-pointer">
            <button
              role="switch"
              aria-checked={target.kind === 'all'}
              aria-label="Control all fixtures"
              onClick={() => { sound.click(); setTarget(target.kind === 'all' ? { kind: 'fixture', id: lead.id } : { kind: 'all' }); }}
              className={`w-9 h-5 border relative ${target.kind === 'all' ? 'bg-[#E5A962]/20 border-[#E5A962]' : 'bg-[#14161B] border-[#343840]'}`}
            >
              <span className={`absolute top-0.5 w-3.5 h-3.5 transition-all ${target.kind === 'all' ? 'left-[18px] bg-[#E5A962]' : 'left-0.5 bg-[#A4A8B1]'}`} />
            </button>
            <span className="hidden sm:inline text-[10px] font-mono font-bold text-[#A4A8B1]">ALL FIXTURES</span>
          </label>
          <button
            onClick={() => { sound.click(); onUpdateFixtures(targetIds, { power: !lead.power }); }}
            className={`p-1.5 border ${lead.power ? 'text-[#52C98A] border-[#52C98A]' : 'text-[#A4A8B1] border-[#343840]'}`}
            aria-label={lead.power ? 'Power off' : 'Power on'}
          >
            <Power className="w-4 h-4" />
          </button>
          <button
            onClick={() => { sound.click(); setShowPresets((s) => !s); }}
            className={`hidden md:flex items-center space-x-1.5 px-2.5 py-1.5 text-[10px] ${chip(showPresets)}`}
            aria-pressed={showPresets}
          >
            <Bookmark className="w-3.5 h-3.5" /><span>PRESETS</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex">
        <aside className={`${mobileView === 'fixtures' ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-64 lg:w-72 border-r border-[#343840] bg-[#14161B] flex-shrink-0`}>
          {fixtureList}
        </aside>
        <main className={`${mobileView === 'controls' ? 'flex' : 'hidden'} ${showPresets ? 'md:hidden lg:flex' : 'md:flex'} flex-col flex-1 min-w-0`}>
          {controls}
        </main>
        {showPresets && (
          <>
            {/* Narrow tablet: presets replace the controls. Wide: side column. */}
            <section className="hidden md:flex lg:hidden flex-col flex-1 min-w-0 bg-[#14161B]">{presetsPanel}</section>
            <aside className="hidden lg:flex flex-col w-80 border-l border-[#343840] bg-[#14161B] flex-shrink-0">{presetsPanel}</aside>
          </>
        )}
        <section className={`${mobileView === 'presets' ? 'flex' : 'hidden'} md:hidden flex-col flex-1 min-w-0`}>{presetsPanel}</section>
      </div>

      {/* Phone bottom tabs */}
      <nav className="md:hidden grid grid-cols-3 border-t border-[#343840] bg-[#191B20] flex-shrink-0">
        {([
          { id: 'fixtures', label: 'FIXTURES', icon: List },
          { id: 'controls', label: 'CONTROLS', icon: SlidersHorizontal },
          { id: 'presets', label: 'PRESETS', icon: Bookmark },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => { sound.click(); setMobileView(t.id); }}
            className={`flex flex-col items-center py-2 text-[10px] font-mono font-bold ${mobileView === t.id ? 'text-[#E5A962]' : 'text-[#A4A8B1]'}`}
          >
            <t.icon className="w-4 h-4 mb-0.5" />
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
};
