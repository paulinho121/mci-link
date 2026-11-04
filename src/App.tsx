import React, { useState, useEffect, useRef, useCallback } from 'react';
import { HeaderBar } from './components/HeaderBar';
import { GrandMasterRail } from './components/GrandMasterRail';
import { FaderBay } from './components/FaderBay';
import { RotaryEncoderStation } from './components/RotaryEncoderStation';
import { StageVisualizer } from './components/StageVisualizer';
import { CueStack } from './components/CueStack';
import { FxEngine } from './components/FxEngine';
import { DmxPatchBay } from './components/DmxPatchBay';
import { Fixture, Cue, FxPreset } from './types/cine';
import { INITIAL_FIXTURES, GEL_PRESETS, INITIAL_CUES, INITIAL_FX } from './data/initialData';
import { sound } from './utils/soundEffects';

export default function App() {
  const [activeTab, setActiveTab] = useState<'faders' | 'stage' | 'rotary' | 'cues' | 'fx' | 'dmx'>('faders');
  const [fixtures, setFixtures] = useState<Fixture[]>(INITIAL_FIXTURES);
  const [selectedFixtureId, setSelectedFixtureId] = useState<string>(INITIAL_FIXTURES[0].id);
  const [grandMaster, setGrandMaster] = useState<number>(100.0);
  const [blackout, setBlackout] = useState<boolean>(false);
  const [flashActive, setFlashActive] = useState<boolean>(false);
  const [locked, setLocked] = useState<boolean>(false);
  
  // Cues & crossfading
  const [cues, setCues] = useState<Cue[]>(INITIAL_CUES);
  const [activeCueId, setActiveCueId] = useState<string>(INITIAL_CUES[0].id);
  const [isCrossfading, setIsCrossfading] = useState<boolean>(false);
  const [crossfadeProgress, setCrossfadeProgress] = useState<number>(1.0);
  const crossfadeTimerRef = useRef<number | null>(null);

  // Cinema Effects
  const [fxList, setFxList] = useState<FxPreset[]>(INITIAL_FX);

  // Update specific fixture helper
  const handleUpdateFixture = useCallback((id: string, updates: Partial<Fixture>) => {
    setFixtures((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  }, []);

  // Update FX preset parameters
  const handleUpdateFxPreset = useCallback((id: string, updates: Partial<FxPreset>) => {
    setFxList((prev) =>
      prev.map((fx) => (fx.id === id ? { ...fx, ...updates } : fx))
    );
  }, []);

  // Solo / Mute toggles
  const handleSoloToggle = useCallback((id: string) => {
    sound.click();
    setFixtures((prev) =>
      prev.map((f) => (f.id === id ? { ...f, solo: !f.solo } : f))
    );
  }, []);

  const handleMuteToggle = useCallback((id: string) => {
    sound.click();
    setFixtures((prev) =>
      prev.map((f) => (f.id === id ? { ...f, muted: !f.muted } : f))
    );
  }, []);

  const handleClearSolos = useCallback(() => {
    setFixtures((prev) => prev.map((f) => ({ ...f, solo: false })));
  }, []);

  const handleStopAllFx = useCallback(() => {
    setFixtures((prev) => prev.map((f) => ({ ...f, activeFxId: undefined })));
  }, []);

  // Cue Execution & Crossfade Engine
  const handleApplyCue = useCallback((cueId: string, duration?: number) => {
    const targetCue = cues.find((c) => c.id === cueId);
    if (!targetCue) return;

    setActiveCueId(cueId);
    const fadeDuration = duration !== undefined ? duration : targetCue.fadeTime;

    if (fadeDuration <= 0.05) {
      // Instant snap cut
      setFixtures((prev) =>
        prev.map((f) => {
          const snap = targetCue.fixturesSnapshot[f.id];
          if (!snap) return f;
          return {
            ...f,
            dimmer: snap.dimmer,
            cct: snap.cct,
            tint: snap.tint,
            power: snap.power,
            activeFxId: snap.activeFxId,
          };
        })
      );
      setIsCrossfading(false);
      setCrossfadeProgress(1.0);
      return;
    }

    // Timed crossfade interpolation
    if (crossfadeTimerRef.current) {
      window.cancelAnimationFrame(crossfadeTimerRef.current);
    }

    const startTime = performance.now();
    const durationMs = fadeDuration * 1000;
    
    // Capture start states
    const startSnapshots = new Map(fixtures.map((f) => [f.id, { dimmer: f.dimmer, cct: f.cct, tint: f.tint }]));

    setIsCrossfading(true);
    setCrossfadeProgress(0);

    const stepFade = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / durationMs);
      setCrossfadeProgress(progress);

      setFixtures((prev) =>
        prev.map((f) => {
          const targetSnap = targetCue.fixturesSnapshot[f.id];
          const startSnap = startSnapshots.get(f.id);
          if (!targetSnap || !startSnap) return f;

          const curDimmer = startSnap.dimmer + (targetSnap.dimmer - startSnap.dimmer) * progress;
          const curCct = Math.round(startSnap.cct + (targetSnap.cct - startSnap.cct) * progress);
          const curTint = Math.round((startSnap.tint + (targetSnap.tint - startSnap.tint) * progress) * 100) / 100;

          return {
            ...f,
            dimmer: curDimmer,
            cct: curCct,
            tint: curTint,
            power: targetSnap.power,
            activeFxId: progress >= 1.0 ? targetSnap.activeFxId : f.activeFxId,
          };
        })
      );

      if (progress < 1.0) {
        crossfadeTimerRef.current = window.requestAnimationFrame(stepFade);
      } else {
        setIsCrossfading(false);
        setCrossfadeProgress(1.0);
      }
    };

    crossfadeTimerRef.current = window.requestAnimationFrame(stepFade);
  }, [cues, fixtures]);

  // Record Current Stage Look as New Cue
  const handleRecordNewCue = useCallback((name: string, scene: string, fadeTime: number) => {
    const newNumber = (cues.length + 1).toFixed(1);
    const snapshot: Cue['fixturesSnapshot'] = {};
    fixtures.forEach((f) => {
      snapshot[f.id] = {
        dimmer: f.dimmer,
        cct: f.cct,
        tint: f.tint,
        power: f.power,
        hue: f.hue,
        saturation: f.saturation,
        activeFxId: f.activeFxId,
      };
    });

    const newCue: Cue = {
      id: `cue-${Date.now()}`,
      number: newNumber,
      name,
      scene,
      fadeTime,
      notes: `Recorded from live stage console at ${new Date().toLocaleTimeString()}`,
      fixturesSnapshot: snapshot,
    };

    setCues((prev) => [...prev, newCue]);
    setActiveCueId(newCue.id);
  }, [cues.length, fixtures]);

  // Update existing cue
  const handleUpdateCue = useCallback((cueId: string) => {
    const snapshot: Cue['fixturesSnapshot'] = {};
    fixtures.forEach((f) => {
      snapshot[f.id] = {
        dimmer: f.dimmer,
        cct: f.cct,
        tint: f.tint,
        power: f.power,
        activeFxId: f.activeFxId,
      };
    });

    setCues((prev) =>
      prev.map((c) => (c.id === cueId ? { ...c, fixturesSnapshot: snapshot } : c))
    );
  }, [fixtures]);

  // Delete cue
  const handleDeleteCue = useCallback((cueId: string) => {
    setCues((prev) => prev.filter((c) => c.id !== cueId));
  }, []);

  // Real-time Cinema FX modulation loop
  useEffect(() => {
    const anyFxActive = fixtures.some((f) => !!f.activeFxId);
    if (!anyFxActive) return;

    let animId: number;
    let lastTime = performance.now();

    const fxLoop = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      // Realtime procedural modulation for fixtures with FX
      setFixtures((prev) =>
        prev.map((f) => {
          if (!f.activeFxId) return f;
          const fx = fxList.find((x) => x.id === f.activeFxId);
          if (!fx) return f;

          let mod = 0;
          const t = time / 1000;

          switch (fx.type) {
            case 'CAMPFIRE': {
              // Organic warm flicker
              const noise = Math.sin(t * fx.frequency * 6.28) * 0.4 + (Math.random() - 0.5) * 0.6;
              mod = noise * (fx.depth / 100) * 15;
              break;
            }
            case 'PULSE': {
              // Sinusoidal breathing
              mod = Math.sin(t * fx.frequency * 6.28) * (fx.depth / 2);
              break;
            }
            case 'TV_FLICKER': {
              // CRT noise
              mod = (Math.random() - 0.5) * (fx.depth / 100) * 20;
              break;
            }
            case 'LIGHTNING': {
              // Random high peak spikes
              if (Math.random() > 0.95) {
                mod = (fx.depth / 100) * 60;
              }
              break;
            }
            case 'COP_CAR': {
              // Alternating flash
              const phase = Math.floor(t * fx.frequency * 2) % 2;
              mod = phase === 0 ? 30 : -30;
              break;
            }
            case 'STROBE': {
              // Tactical hard strobe
              const strobeState = Math.sin(t * fx.frequency * 6.28) > 0;
              mod = strobeState ? 0 : -f.dimmer;
              break;
            }
            case 'PAPARAZZI': {
              // Fast bursts
              if (Math.random() > 0.85) {
                mod = (fx.depth / 100) * 50;
              }
              break;
            }
          }

          const newDim = Math.max(0, Math.min(100, f.dimmer + mod * 0.1));
          return { ...f, dimmer: newDim };
        })
      );

      animId = window.requestAnimationFrame(fxLoop);
    };

    animId = window.requestAnimationFrame(fxLoop);
    return () => window.cancelAnimationFrame(animId);
  }, [fixtures, fxList]);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'F1':
          e.preventDefault();
          sound.click();
          setActiveTab('faders');
          break;
        case 'F2':
          e.preventDefault();
          sound.click();
          setActiveTab('stage');
          break;
        case 'F3':
          e.preventDefault();
          sound.click();
          setActiveTab('rotary');
          break;
        case 'F4':
          e.preventDefault();
          sound.click();
          setActiveTab('cues');
          break;
        case 'F5':
          e.preventDefault();
          sound.click();
          setActiveTab('fx');
          break;
        case 'F6':
          e.preventDefault();
          sound.click();
          setActiveTab('dmx');
          break;
        case ' ':
          // Spacebar: Blackout toggle
          e.preventDefault();
          sound.blackout();
          setBlackout((b) => !b);
          break;
        case 'g':
        case 'G':
          // GO Cue
          e.preventDefault();
          const activeIdx = cues.findIndex((c) => c.id === activeCueId);
          const nextIdx = (activeIdx + 1) % cues.length;
          handleApplyCue(cues[nextIdx].id, cues[nextIdx].fadeTime);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeCueId, cues, handleApplyCue]);

  // Calculate solos
  const soloCount = fixtures.filter((f) => f.solo).length;
  const anySoloActive = soloCount > 0;

  // Apply effective dimmer calculation considering solos & flash
  const effectiveFixtures = fixtures.map((f) => {
    let effectiveDim = f.dimmer;
    if (flashActive) {
      effectiveDim = 100;
    } else if (anySoloActive && !f.solo) {
      effectiveDim = 0;
    }
    // Grand master scale
    effectiveDim = (effectiveDim * (grandMaster / 100));
    return { ...f, dimmer: effectiveDim };
  });

  const selectedFixture = effectiveFixtures.find((f) => f.id === selectedFixtureId) || effectiveFixtures[0];

  return (
    <div className="flex flex-col h-screen w-screen bg-[#101114] text-[#F3F0EA] overflow-hidden select-none font-mono">
      {/* Top Telemetry Hardware Rail & Navigation */}
      <HeaderBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        blackoutActive={blackout}
      />

      {/* Main Workspace Area (padded bottom for Grand Master Rail) */}
      <main className="flex-1 overflow-hidden pb-16">
        {activeTab === 'faders' && (
          <FaderBay
            fixtures={effectiveFixtures}
            gels={GEL_PRESETS}
            selectedFixtureId={selectedFixtureId}
            onSelectFixture={setSelectedFixtureId}
            onUpdateFixture={handleUpdateFixture}
            onSoloToggle={handleSoloToggle}
            onMuteToggle={handleMuteToggle}
            blackoutActive={blackout}
          />
        )}

        {activeTab === 'stage' && (
          <StageVisualizer
            fixtures={effectiveFixtures}
            selectedFixtureId={selectedFixtureId}
            onSelectFixture={setSelectedFixtureId}
            onUpdateFixture={handleUpdateFixture}
            blackoutActive={blackout}
          />
        )}

        {activeTab === 'rotary' && (
          <RotaryEncoderStation
            fixtures={effectiveFixtures}
            selectedFixture={selectedFixture}
            gels={GEL_PRESETS}
            onSelectFixture={setSelectedFixtureId}
            onUpdateFixture={handleUpdateFixture}
          />
        )}

        {activeTab === 'cues' && (
          <CueStack
            cues={cues}
            activeCueId={activeCueId}
            onApplyCue={handleApplyCue}
            onRecordNewCue={handleRecordNewCue}
            onUpdateCue={handleUpdateCue}
            onDeleteCue={handleDeleteCue}
            fixtures={effectiveFixtures}
            isCrossfading={isCrossfading}
            crossfadeProgress={crossfadeProgress}
          />
        )}

        {activeTab === 'fx' && (
          <FxEngine
            fxList={fxList}
            fixtures={effectiveFixtures}
            onUpdateFixture={handleUpdateFixture}
            onUpdateFxPreset={handleUpdateFxPreset}
            onStopAllFx={handleStopAllFx}
          />
        )}

        {activeTab === 'dmx' && (
          <DmxPatchBay
            fixtures={effectiveFixtures}
            onUpdateFixture={handleUpdateFixture}
            blackoutActive={blackout}
          />
        )}
      </main>

      {/* Persistent Grand Master & Blackout Cut Rail */}
      <GrandMasterRail
        grandMaster={grandMaster}
        setGrandMaster={setGrandMaster}
        blackout={blackout}
        setBlackout={setBlackout}
        flashActive={flashActive}
        setFlashActive={setFlashActive}
        locked={locked}
        setLocked={setLocked}
        onClearSolos={handleClearSolos}
        soloCount={soloCount}
      />
    </div>
  );
}
