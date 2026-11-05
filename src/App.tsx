import React, { useState, useEffect, useRef, useCallback } from 'react';
import { HeaderBar } from './components/HeaderBar';
import { GrandMasterRail } from './components/GrandMasterRail';
import { FaderBay } from './components/FaderBay';
import { RotaryEncoderStation } from './components/RotaryEncoderStation';
import { StageVisualizer } from './components/StageVisualizer';
import { CueStack } from './components/CueStack';
import { FxEngine } from './components/FxEngine';
import { DmxPatchBay } from './components/DmxPatchBay';
import { PairingModal } from './components/PairingModal';
import { FixtureControlScreen } from './components/control/FixtureControlScreen';
import { Fixture, Cue, FxPreset, LinkStatus, LookPreset } from './types/cine';
import { INITIAL_FIXTURES, GEL_PRESETS, INITIAL_CUES, INITIAL_FX } from './data/initialData';
import { profileFor } from './data/fixtureProfiles';
import { USER_SLOT_COUNT } from './data/lookPresets';
import { DRIVERS } from './services/lightLink';
import { sidus } from './services/sidus/client';
import { FX_TO_SIDUS_EFFECT, sidusSender, translateEvent } from './services/sidus/driver';
import { applyCurve, invertCurve } from './utils/color';
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

  // Update several fixtures at once (group / all-fixtures control).
  // CCT is clamped to what each fixture can physically reach.
  const handleUpdateFixtures = useCallback((ids: string[], updates: Partial<Fixture>) => {
    const idSet = new Set(ids);
    setFixtures((prev) =>
      prev.map((f) => {
        if (!idSet.has(f.id)) return f;
        const next = { ...f, ...updates };
        if (updates.cct !== undefined) {
          const p = profileFor(f);
          next.cct = Math.min(p.cctMax, Math.max(p.cctMin, updates.cct));
        }
        return next;
      })
    );
  }, []);

  // Pairing & individual control
  const [pairingOpen, setPairingOpen] = useState<boolean>(false);
  const [controlOpen, setControlOpen] = useState<boolean>(false);
  const [identify, setIdentify] = useState<{ id: string; on: boolean } | null>(null);
  const [userPresets, setUserPresets] = useState<(LookPreset | null)[]>(
    () => Array.from({ length: USER_SLOT_COUNT }, () => null)
  );

  const setLinkStatus = useCallback((id: string, status: LinkStatus) => {
    setFixtures((prev) =>
      prev.map((f) => (f.id === id && f.link ? { ...f, link: { ...f.link, status } } : f))
    );
  }, []);

  const handlePaired = useCallback((paired: Fixture[]) => {
    if (!paired.length) return;
    sound.click();
    setFixtures((prev) => [...prev, ...paired]);
    setSelectedFixtureId(paired[0].id);
    setPairingOpen(false);
    setControlOpen(true);
  }, []);

  // amaran Desktop: mirror the socket state onto its fixtures, and apply
  // changes made in amaran Desktop / on the light so the faders follow.
  const grandMasterRef = useRef(100);
  grandMasterRef.current = grandMaster;
  useEffect(() => {
    const offStatus = sidus.onStatus((s) => {
      const status: LinkStatus = s === 'connected' ? 'connected' : s === 'connecting' ? 'connecting' : 'lost';
      if (s === 'connected') sidusSender.resync();
      setFixtures((prev) =>
        prev.map((f) => (f.link?.transport === 'SIDUS' ? { ...f, link: { ...f.link, status } } : f))
      );
    });
    const offEvent = sidus.onEvent((ev) => {
      const change = translateEvent(ev);
      if (!change) return;
      setFixtures((prev) =>
        prev.map((f) => {
          if (f.link?.transport !== 'SIDUS' || f.link.deviceId !== change.nodeId) return f;
          const next = { ...f, ...change.updates };
          if (change.outputLevel !== undefined) {
            // Device reports final output; undo grand master + curve to get the fader.
            const gm = grandMasterRef.current / 100;
            const t = gm > 0 ? Math.min(1, change.outputLevel / 100 / gm) : 0;
            next.dimmer = Math.round(invertCurve(t, f.dimmingCurve) * 1000) / 10;
          }
          return next;
        })
      );
    });
    return () => {
      offStatus();
      offEvent();
    };
  }, []);

  const handleUnpair = useCallback((id: string) => {
    const fixture = fixtures.find((f) => f.id === id);
    if (fixture?.link) DRIVERS[fixture.link.transport].disconnect(fixture.link.deviceId);
    const remaining = fixtures.filter((f) => f.id !== id);
    setFixtures(remaining);
    if (!remaining.length) setControlOpen(false);
    if (selectedFixtureId === id && remaining.length) setSelectedFixtureId(remaining[0].id);
  }, [fixtures, selectedFixtureId]);

  const handleReconnect = useCallback(async (id: string) => {
    const fixture = fixtures.find((f) => f.id === id);
    if (!fixture?.link) return;
    const { transport, deviceId, deviceName, nodeAddress, crmxChannel, firmware } = fixture.link;
    setLinkStatus(id, 'connecting');
    try {
      await DRIVERS[transport].connect({
        deviceId, deviceName, nodeAddress, crmxChannel, transport,
        model: fixture.type, rssi: fixture.rssi, firmware: firmware ?? '',
      });
      setLinkStatus(id, 'connected');
    } catch {
      setLinkStatus(id, 'lost');
    }
  }, [fixtures, setLinkStatus]);

  // Identify: blink the fixture at full for ~2s so it can be found on set
  const handleIdentify = useCallback((id: string) => {
    const fixture = fixtures.find((f) => f.id === id);
    if (fixture?.link) DRIVERS[fixture.link.transport].identify(fixture.link.deviceId);
    setIdentify({ id, on: true });
  }, [fixtures]);

  useEffect(() => {
    if (!identify) return;
    let ticks = 0;
    const timer = window.setInterval(() => {
      ticks += 1;
      if (ticks >= 8) {
        setIdentify(null);
      } else {
        setIdentify((cur) => (cur ? { ...cur, on: !cur.on } : cur));
      }
    }, 250);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identify?.id]);

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
          // amaran fixtures run supported effects on the light itself
          if (f.link?.transport === 'SIDUS' && f.capabilities?.effects.includes(FX_TO_SIDUS_EFFECT[f.activeFxId])) return f;
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
      if (
        pairingOpen ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
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
  }, [activeCueId, cues, handleApplyCue, pairingOpen]);

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
    // Identify blink overrides everything except blackout
    if (identify?.id === f.id) {
      return { ...f, power: true, muted: false, dimmer: identify.on ? 100 : 0 };
    }
    return { ...f, dimmer: effectiveDim };
  });

  // Final level sent to the device (0-100)
  // Final level sent to the device (0-100), shaped by the fixture's dimming curve
  const outputLevelOf = (f: Fixture) =>
    blackout || f.muted || !f.power ? 0 : applyCurve(f.dimmer / 100, f.dimmingCurve) * 100;

  // Push output to every linked fixture (drivers are simulated for now)
  useEffect(() => {
    effectiveFixtures.forEach((f) => {
      if (f.link?.status === 'connected') DRIVERS[f.link.transport].send(f, outputLevelOf(f));
    });
  });

  const outputLevels = Object.fromEntries(effectiveFixtures.map((f) => [f.id, outputLevelOf(f)]));
  const selectedFixture = effectiveFixtures.find((f) => f.id === selectedFixtureId) || effectiveFixtures[0];

  const emptyRig = (
    <div className="h-full flex flex-col items-center justify-center space-y-3 text-[#A4A8B1] font-mono text-xs">
      <span>NO LIGHTS IN THE RIG</span>
      <button
        onClick={() => { sound.click(); setPairingOpen(true); }}
        className="px-3 py-1.5 bg-[#E5A962] text-[#101114] font-black tracking-widest"
      >
        + PAIR LIGHT
      </button>
    </div>
  );

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
            onOpenPairing={() => setPairingOpen(true)}
            onOpenDetail={(id) => { setSelectedFixtureId(id); setControlOpen(true); }}
          />
        )}

        {(activeTab === 'stage' || activeTab === 'rotary') && fixtures.length === 0 && emptyRig}

        {activeTab === 'stage' && fixtures.length > 0 && (
          <StageVisualizer
            fixtures={effectiveFixtures}
            selectedFixtureId={selectedFixtureId}
            onSelectFixture={setSelectedFixtureId}
            onUpdateFixture={handleUpdateFixture}
            blackoutActive={blackout}
          />
        )}

        {activeTab === 'rotary' && fixtures.length > 0 && (
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

      {controlOpen && fixtures.length > 0 && (
        <FixtureControlScreen
          fixtures={fixtures}
          outputLevels={outputLevels}
          selectedFixtureId={selectedFixtureId}
          onSelectFixture={setSelectedFixtureId}
          onUpdateFixtures={handleUpdateFixtures}
          fxList={fxList}
          onUpdateFxPreset={handleUpdateFxPreset}
          gels={GEL_PRESETS}
          identifyingId={identify?.id ?? null}
          onIdentify={handleIdentify}
          onReconnect={handleReconnect}
          onUnpair={handleUnpair}
          onOpenPairing={() => setPairingOpen(true)}
          userPresets={userPresets}
          onSaveUserPreset={(slot, preset) =>
            setUserPresets((prev) => prev.map((p, i) => (i === slot ? preset : p)))
          }
          onClose={() => setControlOpen(false)}
        />
      )}

      {pairingOpen && (
        <PairingModal
          fixtures={fixtures}
          onClose={() => setPairingOpen(false)}
          onPaired={handlePaired}
        />
      )}
    </div>
  );
}
