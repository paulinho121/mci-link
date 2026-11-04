import React, { useRef } from 'react';
import { AlertOctagon, Zap, Lock, Unlock, EyeOff } from 'lucide-react';
import { sound } from '../utils/soundEffects';

interface GrandMasterRailProps {
  grandMaster: number; // 0.0 - 100.0%
  setGrandMaster: (val: number) => void;
  blackout: boolean;
  setBlackout: (val: boolean) => void;
  flashActive: boolean;
  setFlashActive: (val: boolean) => void;
  locked: boolean;
  setLocked: (val: boolean) => void;
  onClearSolos: () => void;
  soloCount: number;
}

export const GrandMasterRail: React.FC<GrandMasterRailProps> = ({
  grandMaster,
  setGrandMaster,
  blackout,
  setBlackout,
  flashActive,
  setFlashActive,
  locked,
  setLocked,
  onClearSolos,
  soloCount,
}) => {
  const faderRef = useRef<HTMLDivElement>(null);

  const handleBlackoutToggle = () => {
    if (locked) return;
    sound.blackout();
    setBlackout(!blackout);
  };

  const handleFlashDown = () => {
    if (locked) return;
    sound.click();
    setFlashActive(true);
  };

  const handleFlashUp = () => {
    if (locked) return;
    setFlashActive(false);
  };

  const handleFaderInteraction = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (locked) return;
    if (!faderRef.current) return;
    const rect = faderRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const offsetX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const percentage = Math.round((offsetX / rect.width) * 1000) / 10;
    setGrandMaster(percentage);
    sound.tick();
  };

  return (
    <footer className="fixed bottom-0 left-0 right-0 h-16 bg-[#14161B] border-t border-[#343840] z-50 flex items-center px-4 justify-between select-none">
      {/* Left: Blackout & Flash Buttons */}
      <div className="flex items-center space-x-3">
        {/* Instant Blackout Cut */}
        <button
          onClick={handleBlackoutToggle}
          className={`h-11 px-5 font-mono font-black text-xs tracking-wider flex items-center space-x-2 border transition-all chamfer-cut ${
            blackout
              ? 'bg-[#E56D6D] text-[#101114] border-white shadow-[0_0_15px_rgba(229,109,109,0.5)] blackout-hatch animate-pulse'
              : 'bg-[#22252B] text-[#E56D6D] border-[#E56D6D]/40 hover:bg-[#E56D6D] hover:text-[#101114]'
          }`}
          title="Instant Blackout Cut (Hardware DMX kill)"
        >
          <AlertOctagon className="w-5 h-5" />
          <span className="text-sm font-heading font-black">BLACKOUT</span>
        </button>

        {/* Flash All Button */}
        <button
          onMouseDown={handleFlashDown}
          onMouseUp={handleFlashUp}
          onTouchStart={handleFlashDown}
          onTouchEnd={handleFlashUp}
          disabled={locked}
          className={`h-11 px-4 font-mono font-black text-xs tracking-wider flex items-center space-x-1.5 border transition-all ${
            flashActive
              ? 'bg-[#F3F0EA] text-[#101114] border-white'
              : 'bg-[#22252B] text-[#E5A962] border-[#343840] hover:border-[#E5A962] active:bg-[#E5A962] active:text-[#101114]'
          }`}
          title="Momentary 100% Strobe Flash Test"
        >
          <Zap className="w-4 h-4 fill-current" />
          <span>FLASH ALL</span>
        </button>

        {/* Solo Clear Alert */}
        {soloCount > 0 && (
          <button
            onClick={() => { sound.click(); onClearSolos(); }}
            className="h-11 px-3 bg-[#E6B45F] text-[#101114] font-mono font-black text-[11px] border border-[#343840] flex items-center space-x-1"
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span>SOLO ACTIVE ({soloCount}) [CLEAR]</span>
          </button>
        )}
      </div>

      {/* Center: Grand Master Rail */}
      <div className="flex-1 max-w-xl mx-6 flex items-center space-x-3">
        <div className="flex flex-col items-end min-w-[70px]">
          <span className="text-[10px] text-[#A4A8B1] uppercase font-bold tracking-wider">G-MASTER</span>
          <span className={`font-mono font-black text-sm tracking-tight ${blackout ? 'text-[#E56D6D]' : 'text-[#E5A962]'}`}>
            {blackout ? 'CUT 0%' : `${grandMaster.toFixed(1)}%`}
          </span>
        </div>

        {/* Custom Hardware Fader Track */}
        <div 
          ref={faderRef}
          onClick={handleFaderInteraction}
          onMouseMove={(e) => e.buttons === 1 && handleFaderInteraction(e)}
          className="flex-1 relative h-9 bg-[#101114] border border-[#343840] cursor-pointer flex items-center px-1"
        >
          {/* Recessed Track Line */}
          <div className="w-full h-1.5 bg-[#14161B] border border-[#343840] relative overflow-hidden">
            {/* Active Fader Fill */}
            <div 
              className={`h-full transition-all duration-75 ${blackout ? 'bg-[#E56D6D]' : 'bg-[#E5A962]'}`}
              style={{ width: `${blackout ? 0 : grandMaster}%` }}
            />
          </div>

          {/* Machined Aluminum Notch Slider Cap */}
          <div 
            className="absolute top-1/2 -translate-y-1/2 w-6 h-7 bg-[#F3F0EA] border border-[#101114] flex items-center justify-center pointer-events-none shadow-md transition-all duration-75"
            style={{ 
              left: `calc(${blackout ? 0 : grandMaster}% - 12px)`,
              opacity: blackout ? 0.4 : 1 
            }}
          >
            {/* Center milled hairline notch */}
            <div className="w-0.5 h-4 bg-[#101114]" />
          </div>
        </div>

        {/* Quick Stepper Presets */}
        <div className="flex space-x-1">
          {[0, 25, 50, 75, 100].map((step) => (
            <button
              key={step}
              onClick={() => {
                if (locked) return;
                sound.tick();
                setGrandMaster(step);
              }}
              className="px-1.5 py-1 text-[10px] bg-[#191B20] border border-[#343840] text-[#A4A8B1] hover:text-[#E5A962] hover:border-[#E5A962]"
            >
              {step}%
            </button>
          ))}
        </div>
      </div>

      {/* Right: Console Lock & Live State */}
      <div className="flex items-center space-x-3">
        <button
          onClick={() => {
            sound.click();
            setLocked(!locked);
          }}
          className={`h-11 px-3 flex items-center space-x-1.5 border font-mono text-xs font-bold ${
            locked
              ? 'bg-[#E6B45F] text-[#101114] border-[#E6B45F]'
              : 'bg-[#22252B] text-[#A4A8B1] border-[#343840] hover:text-[#F3F0EA]'
          }`}
          title={locked ? 'Console Locked' : 'Console Unlocked'}
        >
          {locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
          <span>{locked ? 'LOCKED' : 'UNLOCKED'}</span>
        </button>
      </div>
    </footer>
  );
};
