import React from 'react';
import { Fixture, GelPreset } from '../types/cine';
import { RotaryDial } from './RotaryDial';
import { kelvinToRgb } from '../utils/kelvinToRgb';
import { sound } from '../utils/soundEffects';
import { Sliders, Sun, Palette, Compass, Maximize2, Zap, Check } from 'lucide-react';

interface RotaryEncoderStationProps {
  fixtures: Fixture[];
  selectedFixture: Fixture;
  gels: GelPreset[];
  onSelectFixture: (id: string) => void;
  onUpdateFixture: (id: string, updates: Partial<Fixture>) => void;
}

export const RotaryEncoderStation: React.FC<RotaryEncoderStationProps> = ({
  fixtures,
  selectedFixture,
  gels,
  onSelectFixture,
  onUpdateFixture,
}) => {
  const currentColor = kelvinToRgb(selectedFixture.cct, selectedFixture.tint);

  const handleApplyGel = (gel: GelPreset) => {
    sound.click();
    onUpdateFixture(selectedFixture.id, {
      colorMode: 'GEL',
      gelName: `${gel.code} ${gel.name}`,
    });
  };

  const handleApplyCctPreset = (cct: number) => {
    sound.click();
    onUpdateFixture(selectedFixture.id, {
      cct,
      colorMode: 'CCT',
      gelName: undefined,
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#101114] p-3 overflow-y-auto select-none space-y-3">
      {/* Top Selector Bar: Fixture Tabs */}
      <div className="bg-[#191B20] p-2 border border-[#343840] flex items-center justify-between">
        <div className="flex items-center space-x-2 overflow-x-auto py-0.5">
          <span className="text-[10px] font-mono text-[#A4A8B1] uppercase font-bold tracking-widest">
            TARGET FIXTURE:
          </span>
          {fixtures.map((f) => (
            <button
              key={f.id}
              onClick={() => {
                sound.click();
                onSelectFixture(f.id);
              }}
              className={`px-3 py-1 text-xs font-mono font-bold border transition-colors ${
                f.id === selectedFixture.id
                  ? 'bg-[#E5A962] text-[#101114] border-[#E5A962] font-black'
                  : 'bg-[#22252B] text-[#F3F0EA] border-[#343840] hover:border-[#E5A962]'
              }`}
            >
              {f.tag} ({f.name.split(' ')[0]})
            </button>
          ))}
        </div>

        <div className="hidden md:flex items-center space-x-2 text-xs font-mono">
          <span className="text-[#A4A8B1]">PROFILE:</span>
          <span className="text-[#E5A962] font-bold">{selectedFixture.type}</span>
          <span className="px-1.5 py-0.5 bg-[#14161B] border border-[#343840] text-[#52C98A]">
            U{selectedFixture.universe}:{selectedFixture.startAddress}
          </span>
        </div>
      </div>

      {/* Main Encoders Console Deck */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        {/* Encoder 1: CCT Kelvin */}
        <div className="bg-[#22252B] border border-[#343840] p-4 flex flex-col items-center justify-between">
          <div className="flex items-center space-x-1.5 self-start text-xs font-mono text-[#E5A962] font-bold">
            <Sun className="w-4 h-4" />
            <span>CORRELATED COLOR TEMP</span>
          </div>

          <div className="my-4">
            <RotaryDial
              label="CCT (KELVIN)"
              value={selectedFixture.cct}
              min={2000}
              max={10000}
              step={50}
              unit="KELVIN"
              displayValue={`${selectedFixture.cct}K`}
              color={currentColor.hex}
              size={130}
              onChange={(cct) => onUpdateFixture(selectedFixture.id, { cct, colorMode: 'CCT', gelName: undefined })}
            />
          </div>

          {/* Steppers */}
          <div className="w-full flex justify-between space-x-1">
            <button
              onClick={() => {
                sound.tick();
                onUpdateFixture(selectedFixture.id, { cct: Math.max(2000, selectedFixture.cct - 100) });
              }}
              className="flex-1 py-1 text-xs font-mono bg-[#191B20] border border-[#343840] text-[#A4A8B1] hover:text-[#E5A962]"
            >
              -100K
            </button>
            <button
              onClick={() => {
                sound.tick();
                onUpdateFixture(selectedFixture.id, { cct: Math.min(10000, selectedFixture.cct + 100) });
              }}
              className="flex-1 py-1 text-xs font-mono bg-[#191B20] border border-[#343840] text-[#A4A8B1] hover:text-[#E5A962]"
            >
              +100K
            </button>
          </div>
        </div>

        {/* Encoder 2: Dimmer Intensity */}
        <div className="bg-[#22252B] border border-[#343840] p-4 flex flex-col items-center justify-between">
          <div className="flex items-center space-x-1.5 self-start text-xs font-mono text-[#E5A962] font-bold">
            <Sliders className="w-4 h-4" />
            <span>MASTER INTENSITY</span>
          </div>

          <div className="my-4">
            <RotaryDial
              label="DIMMER LEVEL"
              value={selectedFixture.dimmer}
              min={0}
              max={100}
              step={0.5}
              unit="PERCENT"
              displayValue={`${selectedFixture.dimmer.toFixed(1)}%`}
              color="#E5A962"
              size={130}
              onChange={(dimmer) => onUpdateFixture(selectedFixture.id, { dimmer })}
            />
          </div>

          {/* Steppers */}
          <div className="w-full flex justify-between space-x-1">
            <button
              onClick={() => {
                sound.tick();
                onUpdateFixture(selectedFixture.id, { dimmer: Math.max(0, Math.round((selectedFixture.dimmer - 5) * 10) / 10) });
              }}
              className="flex-1 py-1 text-xs font-mono bg-[#191B20] border border-[#343840] text-[#A4A8B1] hover:text-[#E5A962]"
            >
              -5.0%
            </button>
            <button
              onClick={() => {
                sound.tick();
                onUpdateFixture(selectedFixture.id, { dimmer: Math.min(100, Math.round((selectedFixture.dimmer + 5) * 10) / 10) });
              }}
              className="flex-1 py-1 text-xs font-mono bg-[#191B20] border border-[#343840] text-[#A4A8B1] hover:text-[#E5A962]"
            >
              +5.0%
            </button>
          </div>
        </div>

        {/* Encoder 3: Tint Shift (+/- Green) */}
        <div className="bg-[#22252B] border border-[#343840] p-4 flex flex-col items-center justify-between">
          <div className="flex items-center space-x-1.5 self-start text-xs font-mono text-[#E5A962] font-bold">
            <Palette className="w-4 h-4" />
            <span>PLUS / MINUS GREEN</span>
          </div>

          <div className="my-4">
            <RotaryDial
              label="TINT SHIFT"
              value={selectedFixture.tint}
              min={-1}
              max={1}
              step={0.01}
              unit="TINT"
              displayValue={
                selectedFixture.tint > 0 
                  ? `+${selectedFixture.tint.toFixed(2)}G` 
                  : selectedFixture.tint < 0 
                    ? `${selectedFixture.tint.toFixed(2)}M` 
                    : '0.00'
              }
              color={selectedFixture.tint >= 0 ? '#71E7A5' : '#FFB4AB'}
              size={130}
              onChange={(tint) => onUpdateFixture(selectedFixture.id, { tint: Math.round(tint * 100) / 100 })}
            />
          </div>

          {/* Steppers */}
          <div className="w-full flex justify-between space-x-1">
            <button
              onClick={() => {
                sound.tick();
                onUpdateFixture(selectedFixture.id, { tint: 0 });
              }}
              className="flex-1 py-1 text-xs font-mono bg-[#191B20] border border-[#343840] text-[#A4A8B1] hover:text-[#E5A962]"
            >
              ZERO TINT
            </button>
          </div>
        </div>

        {/* Encoder 4: Beam Angle / Spread */}
        <div className="bg-[#22252B] border border-[#343840] p-4 flex flex-col items-center justify-between">
          <div className="flex items-center space-x-1.5 self-start text-xs font-mono text-[#E5A962] font-bold">
            <Maximize2 className="w-4 h-4" />
            <span>OPTICAL SPREAD</span>
          </div>

          <div className="my-4">
            <RotaryDial
              label="BEAM ANGLE"
              value={selectedFixture.beamAngle}
              min={15}
              max={90}
              step={1}
              unit="DEGREES"
              displayValue={`${selectedFixture.beamAngle}°`}
              color="#A4A8B1"
              size={130}
              onChange={(beamAngle) => onUpdateFixture(selectedFixture.id, { beamAngle })}
            />
          </div>

          {/* Steppers */}
          <div className="w-full flex justify-between space-x-1">
            <button
              onClick={() => {
                sound.tick();
                onUpdateFixture(selectedFixture.id, { beamAngle: 25 });
              }}
              className="flex-1 py-1 text-[11px] font-mono bg-[#191B20] border border-[#343840] text-[#A4A8B1] hover:text-[#E5A962]"
            >
              SPOT 25°
            </button>
            <button
              onClick={() => {
                sound.tick();
                onUpdateFixture(selectedFixture.id, { beamAngle: 65 });
              }}
              className="flex-1 py-1 text-[11px] font-mono bg-[#191B20] border border-[#343840] text-[#A4A8B1] hover:text-[#E5A962]"
            >
              FLOOD 65°
            </button>
          </div>
        </div>

        {/* Encoder 5: Pan Rotation */}
        <div className="bg-[#22252B] border border-[#343840] p-4 flex flex-col items-center justify-between">
          <div className="flex items-center space-x-1.5 self-start text-xs font-mono text-[#E5A962] font-bold">
            <Compass className="w-4 h-4" />
            <span>STAGE PAN ORIENTATION</span>
          </div>

          <div className="my-4">
            <RotaryDial
              label="PAN AZIMUTH"
              value={selectedFixture.rotation}
              min={0}
              max={360}
              step={5}
              unit="DEGREES"
              displayValue={`${selectedFixture.rotation}°`}
              color="#E5A962"
              size={130}
              onChange={(rotation) => onUpdateFixture(selectedFixture.id, { rotation })}
            />
          </div>

          {/* Steppers */}
          <div className="w-full flex justify-between space-x-1">
            <button
              onClick={() => {
                sound.tick();
                onUpdateFixture(selectedFixture.id, { rotation: (selectedFixture.rotation + 45) % 360 });
              }}
              className="flex-1 py-1 text-xs font-mono bg-[#191B20] border border-[#343840] text-[#A4A8B1] hover:text-[#E5A962]"
            >
              +45° PAN
            </button>
          </div>
        </div>
      </div>

      {/* Quick Kelvin Presets Row */}
      <div className="bg-[#191B20] p-3 border border-[#343840]">
        <div className="text-[10px] font-mono text-[#A4A8B1] uppercase font-bold tracking-widest mb-2 flex items-center justify-between">
          <span>RAPID KELVIN PRESETS (CALIBRATED EMISSIONS):</span>
          <span className="text-[#E5A962]">PLANCKIAN LOCUS 100% CRI</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
          {[
            { cct: 2000, label: '2000K', desc: 'Candlelight / Fire' },
            { cct: 2800, label: '2800K', desc: 'Golden Hour' },
            { cct: 3200, label: '3200K', desc: 'Tungsten 100%' },
            { cct: 4300, label: '4300K', desc: 'Fluorescent Studio' },
            { cct: 5600, label: '5600K', desc: 'Daylight HMI' },
            { cct: 6500, label: '6500K', desc: 'Overcast Sky' },
            { cct: 8000, label: '8000K', desc: 'Deep Blue Shadow' },
          ].map((preset) => {
            const previewColor = kelvinToRgb(preset.cct);
            const isCurrent = selectedFixture.cct === preset.cct;
            return (
              <button
                key={preset.cct}
                onClick={() => handleApplyCctPreset(preset.cct)}
                className={`p-2 border text-left transition-all flex flex-col justify-between ${
                  isCurrent
                    ? 'bg-[#22252B] border-[#E5A962] ring-1 ring-[#E5A962]'
                    : 'bg-[#14161B] border-[#343840] hover:border-[#A4A8B1]'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <div
                    className="w-3.5 h-3.5 border border-[#343840]"
                    style={{ backgroundColor: previewColor.hex }}
                  />
                  <span className="font-mono font-bold text-xs text-[#F3F0EA]">
                    {preset.label}
                  </span>
                </div>
                <div className="text-[9px] text-[#A4A8B1] font-mono truncate">
                  {preset.desc}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lee & Rosco Cinema Gel Preset Library */}
      <div className="bg-[#191B20] p-3 border border-[#343840]">
        <div className="text-[10px] font-mono text-[#A4A8B1] uppercase font-bold tracking-widest mb-2 flex items-center justify-between">
          <span>CINEMA GEL CATALOGUE (LEE & ROSCO COMPLIANT):</span>
          {selectedFixture.gelName && (
            <span className="text-[#52C98A] font-bold">
              ACTIVE GEL: {selectedFixture.gelName}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {gels.map((gel) => {
            const isApplied = selectedFixture.gelName === `${gel.code} ${gel.name}`;
            return (
              <button
                key={gel.id}
                onClick={() => handleApplyGel(gel)}
                className={`p-2 border text-left flex items-center space-x-2 transition-all ${
                  isApplied
                    ? 'bg-[#22252B] border-[#E5A962] ring-1 ring-[#E5A962]'
                    : 'bg-[#14161B] border-[#343840] hover:border-[#A4A8B1]'
                }`}
              >
                <div
                  className="w-5 h-5 flex-shrink-0 border border-[#343840] flex items-center justify-center"
                  style={{ backgroundColor: gel.hex }}
                >
                  {isApplied && <Check className="w-3.5 h-3.5 text-black stroke-[3]" />}
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center space-x-1">
                    <span className="text-[11px] font-mono font-bold text-[#E5A962]">{gel.code}</span>
                    <span className="text-[10px] font-heading text-[#F3F0EA] truncate">{gel.name}</span>
                  </div>
                  <div className="text-[8px] font-mono text-[#A4A8B1]">
                    T: {gel.transmission}% {gel.cctShift ? `• ${gel.cctShift}` : ''}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
