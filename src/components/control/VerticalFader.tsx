import React, { useRef } from 'react';
import { Minus, Plus } from 'lucide-react';
import { sound } from '../../utils/soundEffects';

interface VerticalFaderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Amount the +/- buttons move the value. */
  nudge?: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  /** CSS background for the track (e.g. a warm→cool gradient for CCT). */
  trackBackground?: string;
  disabled?: boolean;
}

const snap = (v: number, step: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round((v - min) / step) * step + min));

export const VerticalFader: React.FC<VerticalFaderProps> = ({
  label,
  value,
  min,
  max,
  step,
  nudge = step,
  format,
  onChange,
  trackBackground,
  disabled,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = max === min ? 100 : ((value - min) / (max - min)) * 100;

  const setFromPointer = (clientY: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const t = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const next = snap(min + t * (max - min), step, min, max);
    if (next !== value) {
      sound.tick();
      onChange(Number(next.toFixed(4)));
    }
  };

  const bump = (dir: 1 | -1) => {
    sound.tick();
    onChange(Number(snap(value + dir * nudge, step, min, max).toFixed(4)));
  };

  return (
    <div className={`flex flex-col items-center h-full min-h-0 select-none ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <div className="px-2.5 py-0.5 mb-2 bg-[#101114] border border-[#343840] font-mono font-bold text-xs text-[#F3F0EA] min-w-[64px] text-center">
        {format(value)}
      </div>
      <button
        onClick={() => bump(1)}
        className="mb-2 w-7 h-7 flex items-center justify-center border border-[#343840] text-[#A4A8B1] hover:text-[#E5A962] hover:border-[#E5A962]"
        aria-label={`${label} up`}
      >
        <Plus className="w-3.5 h-3.5" />
      </button>

      <div
        ref={trackRef}
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') { e.preventDefault(); bump(1); }
          if (e.key === 'ArrowDown') { e.preventDefault(); bump(-1); }
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setFromPointer(e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) setFromPointer(e.clientY);
        }}
        className="relative flex-1 min-h-[120px] w-14 bg-[#14161B] border border-[#343840] cursor-pointer touch-none focus:outline-none focus:border-[#E5A962]"
        style={trackBackground ? { background: trackBackground } : undefined}
      >
        {!trackBackground && (
          <div className="absolute bottom-0 left-0 right-0 bg-[#E5A962]/25" style={{ height: `${pct}%` }} />
        )}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-12 h-4 bg-[#F3F0EA] border border-[#101114] shadow flex items-center justify-center pointer-events-none"
          style={{ bottom: `calc(${pct}% - 8px)` }}
        >
          <div className="w-7 h-0.5 bg-[#101114]" />
        </div>
      </div>

      <button
        onClick={() => bump(-1)}
        className="mt-2 w-7 h-7 flex items-center justify-center border border-[#343840] text-[#A4A8B1] hover:text-[#E5A962] hover:border-[#E5A962]"
        aria-label={`${label} down`}
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <div className="mt-2 px-2.5 py-0.5 bg-[#191B20] border border-[#343840] text-[10px] font-mono font-black tracking-widest text-[#A4A8B1]">
        {label}
      </div>
    </div>
  );
};
