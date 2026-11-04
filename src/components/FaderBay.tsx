import React, { useRef, useState } from 'react';
import { Fixture, GelPreset } from '../types/cine';
import { kelvinToRgb } from '../utils/kelvinToRgb';
import { sound } from '../utils/soundEffects';
import { Power, Zap, Wifi, Battery, Layers } from 'lucide-react';

interface FaderBayProps {
  fixtures: Fixture[];
  gels: GelPreset[];
  selectedFixtureId: string;
  onSelectFixture: (id: string) => void;
  onUpdateFixture: (id: string, updates: Partial<Fixture>) => void;
  onSoloToggle: (id: string) => void;
  onMuteToggle: (id: string) => void;
  blackoutActive: boolean;
}

export const FaderBay: React.FC<FaderBayProps> = ({
  fixtures,
  selectedFixtureId,
  onSelectFixture,
  onUpdateFixture,
  onSoloToggle,
  onMuteToggle,
  blackoutActive,
}) => {
  const [activeGroupFilter, setActiveGroupFilter] = useState<number | null>(null);

  const filteredFixtures = activeGroupFilter === null 
    ? fixtures 
    : fixtures.filter(f => f.group === activeGroupFilter);

  return (
    <div className="flex flex-col h-full bg-[#101114] p-3 overflow-hidden select-none">
      {/* Top Filter Bar */}
      <div className="flex items-center justify-between mb-3 bg-[#191B20] p-2 border border-[#343840]">
        <div className="flex items-center space-x-2">
          <span className="text-[10px] uppercase font-bold text-[#A4A8B1] tracking-widest font-mono">
            BANKS / GROUPS:
          </span>
          <button
            onClick={() => { sound.click(); setActiveGroupFilter(null); }}
            className={`px-2.5 py-1 text-xs font-mono font-bold border transition-colors ${
              activeGroupFilter === null
                ? 'bg-[#E5A962] text-[#101114] border-[#E5A962]'
                : 'bg-[#22252B] text-[#F3F0EA] border-[#343840] hover:border-[#E5A962]'
            }`}
          >
            ALL FIXTURES ({fixtures.length})
          </button>
          {[1, 2, 3].map((grp) => (
            <button
              key={grp}
              onClick={() => { sound.click(); setActiveGroupFilter(grp); }}
              className={`px-2.5 py-1 text-xs font-mono font-bold border transition-colors ${
                activeGroupFilter === grp
                  ? 'bg-[#E5A962] text-[#101114] border-[#E5A962]'
                  : 'bg-[#22252B] text-[#F3F0EA] border-[#343840] hover:border-[#E5A962]'
              }`}
            >
              GRP {grp} ({fixtures.filter(f => f.group === grp).length})
            </button>
          ))}
        </div>

        <div className="flex items-center space-x-3 text-xs text-[#A4A8B1] font-mono">
          <div className="flex items-center space-x-1">
            <span className="w-2 h-2 bg-[#52C98A] inline-block" />
            <span>ONLINE: {fixtures.filter(f => f.power && !f.muted).length}/{fixtures.length}</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="w-2 h-2 bg-[#E5A962] inline-block" />
            <span>AVG DIM: {Math.round(fixtures.reduce((a, b) => a + b.dimmer, 0) / fixtures.length)}%</span>
          </div>
        </div>
      </div>

      {/* Fixture Channel Strips Grid */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden pb-2">
        <div className="flex space-x-2.5 h-full min-w-max">
          {filteredFixtures.map((fixture) => (
            <FixtureChannelStrip
              key={fixture.id}
              fixture={fixture}
              isSelected={selectedFixtureId === fixture.id}
              onSelect={() => onSelectFixture(fixture.id)}
              onUpdate={(updates) => onUpdateFixture(fixture.id, updates)}
              onSolo={() => onSoloToggle(fixture.id)}
              onMute={() => onMuteToggle(fixture.id)}
              blackoutActive={blackoutActive}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

interface FixtureChannelStripProps {
  fixture: Fixture;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<Fixture>) => void;
  onSolo: () => void;
  onMute: () => void;
  blackoutActive: boolean;
}

const FixtureChannelStrip: React.FC<FixtureChannelStripProps> = ({
  fixture,
  isSelected,
  onSelect,
  onUpdate,
  onSolo,
  onMute,
  blackoutActive,
}) => {
  const faderRailRef = useRef<HTMLDivElement>(null);
  const colorData = kelvinToRgb(fixture.cct, fixture.tint);

  // Compute effective dimmer
  const effectiveDimmer = (blackoutActive || fixture.muted || !fixture.power) ? 0 : fixture.dimmer;

  const handleFaderDrag = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!faderRailRef.current) return;
    const rect = faderRailRef.current.getBoundingClientRect();
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    // Invert Y because top is 100%, bottom is 0%
    const offsetY = Math.max(0, Math.min(rect.height, clientY - rect.top));
    const percentage = Math.round((1 - offsetY / rect.height) * 1000) / 10;
    onUpdate({ dimmer: percentage });
    sound.tick();
  };

  return (
    <div
      onClick={onSelect}
      className={`w-36 flex flex-col h-full bg-[#22252B] border transition-all cursor-pointer ${
        isSelected
          ? 'border-[#E5A962] ring-1 ring-[#E5A962]'
          : 'border-[#343840] hover:border-[#A4A8B1]'
      }`}
    >
      {/* Header Strip */}
      <div className="bg-[#191B20] p-1.5 border-b border-[#343840] flex flex-col space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono font-black text-[#E5A962] tracking-wider">
            {fixture.tag}
          </span>
          <div className="flex items-center space-x-1">
            <Wifi className="w-2.5 h-2.5 text-[#52C98A]" />
            <span className="text-[9px] font-mono text-[#52C98A]">{fixture.rssi}dB</span>
          </div>
        </div>

        <div className="text-[10px] font-heading font-semibold text-[#F3F0EA] truncate" title={fixture.name}>
          {fixture.name}
        </div>

        <div className="flex items-center justify-between text-[9px] font-mono text-[#A4A8B1]">
          <span>U{fixture.universe}:{fixture.startAddress}</span>
          <span className="px-1 bg-[#101114] border border-[#343840]">GRP {fixture.group}</span>
        </div>
      </div>

      {/* Parameter Telemetry: CCT & Tint Quick Box */}
      <div className="p-1.5 bg-[#14161B] border-b border-[#343840] flex flex-col space-y-1 text-center">
        <div className="flex items-center justify-between px-1">
          <span className="text-[9px] font-mono text-[#A4A8B1]">CCT</span>
          <div className="flex items-center space-x-1">
            <div 
              className="w-2.5 h-2.5 border border-[#343840]"
              style={{ backgroundColor: colorData.hex }}
            />
            <span className="text-[11px] font-mono font-bold text-[#F3F0EA]">
              {fixture.cct}K
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between px-1 text-[9px] font-mono">
          <span className="text-[#A4A8B1]">TINT</span>
          <span className={`font-bold ${fixture.tint > 0 ? 'text-[#71E7A5]' : fixture.tint < 0 ? 'text-pink-400' : 'text-[#A4A8B1]'}`}>
            {fixture.tint > 0 ? `+${fixture.tint.toFixed(2)}G` : fixture.tint < 0 ? `${fixture.tint.toFixed(2)}M` : '0.00'}
          </span>
        </div>

        {fixture.activeFxId && (
          <div className="px-1 py-0.5 bg-[#E6B45F]/20 text-[#E6B45F] text-[9px] font-bold border border-[#E6B45F]/40 truncate">
            FX: {fixture.activeFxId.replace('fx-', '').toUpperCase()}
          </div>
        )}
      </div>

      {/* Main Vertical Fader Section */}
      <div className="flex-1 flex flex-col items-center justify-center p-2 relative bg-[#1B1B1F]">
        {/* Dimmer Numerical Readout */}
        <div className="mb-2 text-center">
          <div className="text-[9px] font-mono text-[#A4A8B1] tracking-widest uppercase">DIMMER</div>
          <div className={`font-mono font-black text-sm ${fixture.power && !fixture.muted && !blackoutActive ? 'text-[#E5A962]' : 'text-[#A4A8B1]'}`}>
            {fixture.dimmer.toFixed(1)}%
          </div>
        </div>

        {/* Vertical Fader Track */}
        <div 
          ref={faderRailRef}
          onClick={handleFaderDrag}
          onMouseMove={(e) => e.buttons === 1 && handleFaderDrag(e)}
          className="flex-1 w-7 bg-[#101114] border border-[#343840] relative cursor-pointer flex justify-center py-2"
        >
          {/* Internal Track Slot */}
          <div className="w-1.5 h-full bg-[#14161B] border border-[#343840] relative overflow-hidden">
            {/* Active Amber Level Fill */}
            <div 
              className="absolute bottom-0 left-0 right-0 bg-[#E5A962] transition-all duration-75"
              style={{ height: `${effectiveDimmer}%` }}
            />
          </div>

          {/* Machined Notch Fader Cap */}
          <div 
            className="absolute left-1/2 -translate-x-1/2 w-6 h-3 bg-[#F3F0EA] border border-[#101114] flex items-center justify-center shadow pointer-events-none transition-all duration-75"
            style={{ 
              bottom: `calc(${fixture.dimmer}% - 6px)`,
              opacity: fixture.power && !fixture.muted ? 1 : 0.4
            }}
          >
            {/* Center milled horizontal notch */}
            <div className="w-4 h-0.5 bg-[#101114]" />
          </div>
        </div>

        {/* Quick Stepper Notch Marks */}
        <div className="w-full flex justify-between px-1 mt-1 text-[8px] font-mono text-[#A4A8B1]">
          <button 
            onClick={(e) => { e.stopPropagation(); sound.tick(); onUpdate({ dimmer: 0 }); }}
            className="hover:text-[#E5A962]"
          >
            0
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); sound.tick(); onUpdate({ dimmer: 50 }); }}
            className="hover:text-[#E5A962]"
          >
            50
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); sound.tick(); onUpdate({ dimmer: 100 }); }}
            className="hover:text-[#E5A962]"
          >
            100
          </button>
        </div>
      </div>

      {/* Channel Strip Foot Controls: Solo, Mute, Flash, Power */}
      <div className="p-1.5 bg-[#191B20] border-t border-[#343840] flex flex-col space-y-1">
        <div className="grid grid-cols-2 gap-1">
          {/* Solo Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSolo();
            }}
            className={`py-1 text-center font-mono font-black text-[10px] border transition-colors ${
              fixture.solo
                ? 'bg-[#E6B45F] text-[#101114] border-[#E6B45F]'
                : 'bg-[#22252B] text-[#A4A8B1] border-[#343840] hover:text-[#F3F0EA]'
            }`}
          >
            SOLO
          </button>

          {/* Mute Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMute();
            }}
            className={`py-1 text-center font-mono font-black text-[10px] border transition-colors ${
              fixture.muted
                ? 'bg-[#E56D6D] text-[#101114] border-[#E56D6D]'
                : 'bg-[#22252B] text-[#A4A8B1] border-[#343840] hover:text-[#F3F0EA]'
            }`}
          >
            MUTE
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1">
          {/* Quick Strobe/Flash Toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              sound.tick();
              onUpdate({ dimmer: fixture.dimmer > 0 ? 0 : 100 });
            }}
            className="py-1 flex items-center justify-center space-x-0.5 bg-[#22252B] border border-[#343840] text-[#E5A962] text-[9px] font-bold hover:bg-[#E5A962] hover:text-[#101114]"
            title="Toggle Full / Off"
          >
            <Zap className="w-2.5 h-2.5" />
            <span>FULL</span>
          </button>

          {/* Fixture Power Switch */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              sound.click();
              onUpdate({ power: !fixture.power });
            }}
            className={`py-1 flex items-center justify-center space-x-0.5 border text-[9px] font-bold ${
              fixture.power
                ? 'bg-[#191B20] text-[#52C98A] border-[#52C98A]'
                : 'bg-[#191B20] text-[#A4A8B1] border-[#343840]'
            }`}
          >
            <Power className="w-2.5 h-2.5" />
            <span>{fixture.power ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
