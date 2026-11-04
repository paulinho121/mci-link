import React, { useState } from 'react';
import { Fixture, FxPreset, FxType } from '../types/cine';
import { sound } from '../utils/soundEffects';
import { Zap, Flame, Radio, Tv, Activity, Sparkles, AlertTriangle, Play, Square } from 'lucide-react';

interface FxEngineProps {
  fxList: FxPreset[];
  fixtures: Fixture[];
  onUpdateFixture: (id: string, updates: Partial<Fixture>) => void;
  onUpdateFxPreset: (id: string, updates: Partial<FxPreset>) => void;
  onStopAllFx: () => void;
}

export const FxEngine: React.FC<FxEngineProps> = ({
  fxList,
  fixtures,
  onUpdateFixture,
  onUpdateFxPreset,
  onStopAllFx,
}) => {
  const [selectedFxId, setSelectedFxId] = useState<string>(fxList[0].id);

  const currentFx = fxList.find(f => f.id === selectedFxId) || fxList[0];

  const getFxIcon = (type: FxType) => {
    switch (type) {
      case 'COP_CAR': return Radio;
      case 'CAMPFIRE': return Flame;
      case 'PAPARAZZI': return Sparkles;
      case 'LIGHTNING': return Zap;
      case 'TV_FLICKER': return Tv;
      case 'PULSE': return Activity;
      case 'STROBE': return AlertTriangle;
    }
  };

  const handleToggleFixtureFx = (fixtureId: string) => {
    sound.tick();
    const fix = fixtures.find(f => f.id === fixtureId);
    if (!fix) return;
    if (fix.activeFxId === currentFx.id) {
      onUpdateFixture(fixtureId, { activeFxId: undefined });
    } else {
      onUpdateFixture(fixtureId, { activeFxId: currentFx.id });
    }
  };

  const handleApplyToAll = () => {
    sound.click();
    fixtures.forEach(f => {
      onUpdateFixture(f.id, { activeFxId: currentFx.id });
    });
  };

  return (
    <div className="flex flex-col lg:flex-row h-full bg-[#101114] p-3 gap-3 overflow-hidden select-none">
      {/* Left Column: Preset FX Library */}
      <div className="w-full lg:w-80 bg-[#191B20] border border-[#343840] p-3 flex flex-col justify-between">
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-[#343840] pb-2">
            <span className="text-[10px] font-mono text-[#E5A962] uppercase font-bold tracking-widest">
              CINEMA EFFECTS GENERATOR
            </span>
            <button
              onClick={() => { sound.click(); onStopAllFx(); }}
              className="px-2 py-0.5 bg-[#22252B] border border-red-500/50 text-red-400 text-[10px] font-mono hover:bg-red-500 hover:text-white flex items-center space-x-1"
            >
              <Square className="w-2.5 h-2.5 fill-current" />
              <span>KILL ALL FX</span>
            </button>
          </div>

          {/* Effects Selection Stack */}
          <div className="space-y-1.5 overflow-y-auto max-h-[calc(100vh-280px)]">
            {fxList.map((fx) => {
              const Icon = getFxIcon(fx.type);
              const isSelected = fx.id === selectedFxId;
              const assignedCount = fixtures.filter(f => f.activeFxId === fx.id).length;

              return (
                <button
                  key={fx.id}
                  onClick={() => { sound.click(); setSelectedFxId(fx.id); }}
                  className={`w-full p-2.5 text-left border transition-all flex items-center justify-between ${
                    isSelected
                      ? 'bg-[#22252B] border-[#E5A962] ring-1 ring-[#E5A962]'
                      : 'bg-[#14161B] border-[#343840] hover:border-[#A4A8B1]'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <div className={`p-1.5 ${isSelected ? 'bg-[#E5A962] text-[#101114]' : 'bg-[#191B20] text-[#A4A8B1]'}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-heading font-bold text-xs text-[#F3F0EA]">{fx.name}</div>
                      <div className="text-[9px] font-mono text-[#A4A8B1]">
                        {fx.frequency.toFixed(1)}Hz • DEPTH {fx.depth}%
                      </div>
                    </div>
                  </div>

                  {assignedCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-[#E5A962] text-[#101114] text-[9px] font-mono font-bold">
                      {assignedCount} ON
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Global Stop / Summary */}
        <div className="pt-3 border-t border-[#343840] text-center text-[10px] font-mono text-[#A4A8B1]">
          DMX RENDER LOOP: 60 FPS SYNCHRONIZED
        </div>
      </div>

      {/* Right Column: Active FX Parameters & Fixture Assignment Matrix */}
      <div className="flex-1 bg-[#191B20] border border-[#343840] p-4 flex flex-col justify-between space-y-4 overflow-y-auto">
        <div className="space-y-4">
          {/* Header of Active FX */}
          <div className="flex items-center justify-between border-b border-[#343840] pb-3">
            <div>
              <div className="text-[10px] font-mono text-[#E5A962] font-bold tracking-widest uppercase">
                EFFECT PARAMETERS: {currentFx.type}
              </div>
              <div className="font-heading font-black text-lg text-[#F3F0EA]">
                {currentFx.name}
              </div>
              <div className="text-xs font-mono text-[#A4A8B1]">
                {currentFx.description}
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={handleApplyToAll}
                className="px-3 py-1.5 bg-[#E5A962] text-[#101114] font-mono font-bold text-xs border border-[#E5A962] hover:bg-[#D99B52]"
              >
                APPLY TO ALL FIXTURES
              </button>
            </div>
          </div>

          {/* Real-time Oscillating Wave Simulator Graphic */}
          <div className="bg-[#101114] border border-[#343840] p-3 flex flex-col justify-center items-center h-28 relative overflow-hidden">
            <div className="absolute top-2 left-2 text-[9px] font-mono text-[#A4A8B1]">
              LUMINANCE MODULATION OSCILLATOR (SIM)
            </div>
            
            {/* SVG Wave */}
            <svg className="w-full h-16" preserveAspectRatio="none" viewBox="0 0 500 100">
              <path
                d="M 0 50 Q 25 10, 50 50 T 100 50 T 150 50 T 200 50 T 250 50 T 300 50 T 350 50 T 400 50 T 450 50 T 500 50"
                fill="none"
                stroke="#E5A962"
                strokeWidth="2.5"
                className="animate-pulse"
              />
            </svg>
            <div className="text-[10px] font-mono text-[#E5A962] mt-1">
              {currentFx.frequency} HZ • {currentFx.depth}% MODULATION AMPLITUDE
            </div>
          </div>

          {/* Interactive Parameter Sliders */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#14161B] p-4 border border-[#343840]">
            <div>
              <div className="flex justify-between text-xs font-mono mb-2">
                <span className="text-[#A4A8B1] uppercase font-bold">CYCLE FREQUENCY / SPEED:</span>
                <span className="text-[#E5A962] font-black">{currentFx.frequency.toFixed(1)} Hz</span>
              </div>
              <input
                type="range"
                min={0.2}
                max={20}
                step={0.1}
                value={currentFx.frequency}
                onChange={(e) => onUpdateFxPreset(currentFx.id, { frequency: Number(e.target.value) })}
                className="w-full accent-[#E5A962] bg-[#22252B] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-mono mb-2">
                <span className="text-[#A4A8B1] uppercase font-bold">MODULATION DEPTH:</span>
                <span className="text-[#E5A962] font-black">{currentFx.depth}%</span>
              </div>
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={currentFx.depth}
                onChange={(e) => onUpdateFxPreset(currentFx.id, { depth: Number(e.target.value) })}
                className="w-full accent-[#E5A962] bg-[#22252B] cursor-pointer"
              />
            </div>
          </div>

          {/* Fixture Target Assignment Grid */}
          <div>
            <div className="text-[10px] font-mono text-[#A4A8B1] uppercase font-bold tracking-widest mb-2">
              ASSIGN TO FIXTURES: (CLICK TO ENGAGE / DISENGAGE)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {fixtures.map((fixture) => {
                const isAssigned = fixture.activeFxId === currentFx.id;
                const hasOtherFx = fixture.activeFxId && !isAssigned;

                return (
                  <button
                    key={fixture.id}
                    onClick={() => handleToggleFixtureFx(fixture.id)}
                    className={`p-3 border text-left flex flex-col justify-between transition-all ${
                      isAssigned
                        ? 'bg-[#22252B] border-[#E5A962] ring-1 ring-[#E5A962]'
                        : 'bg-[#14161B] border-[#343840] hover:border-[#A4A8B1]'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="font-mono font-black text-xs text-[#F3F0EA]">
                        {fixture.tag}
                      </span>
                      <span className={`w-2 h-2 ${isAssigned ? 'bg-[#E5A962] animate-ping' : 'bg-[#343840]'}`} />
                    </div>
                    <div className="text-[10px] font-heading text-[#A4A8B1] truncate">
                      {fixture.name}
                    </div>
                    <div className="text-[9px] font-mono mt-2 flex items-center justify-between">
                      <span className={isAssigned ? 'text-[#E5A962] font-bold' : 'text-[#A4A8B1]'}>
                        {isAssigned ? 'FX ACTIVE' : hasOtherFx ? 'OTHER FX' : 'OFF'}
                      </span>
                      <span className="text-[#A4A8B1]">DIM {fixture.dimmer.toFixed(0)}%</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
