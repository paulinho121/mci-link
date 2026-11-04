import React, { useRef, useState, useEffect } from 'react';
import { sound } from '../utils/soundEffects';

interface RotaryDialProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  displayValue?: string | number;
  color?: string; // arc highlight color, default #E5A962
  onChange: (val: number) => void;
  size?: number; // default 120
}

export const RotaryDial: React.FC<RotaryDialProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  displayValue,
  color = '#E5A962',
  onChange,
  size = 120,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const dialRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragStartVal = useRef(0);

  // Normalize angle between -135deg and +135deg (270 degree total sweep)
  const fraction = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angle = -135 + fraction * 270;

  // Arc path math
  const radius = size * 0.42;
  const strokeWidth = 5;
  const center = size / 2;

  // Polar to cartesian
  const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number) => {
    const angleInRad = ((angleDeg - 90) * Math.PI) / 180.0;
    return {
      x: cx + r * Math.cos(angleInRad),
      y: cy + r * Math.sin(angleInRad),
    };
  };

  const describeArc = (x: number, y: number, r: number, startAngle: number, endAngle: number) => {
    const start = polarToCartesian(x, y, r, endAngle);
    const end = polarToCartesian(x, y, r, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
    return ['M', start.x, start.y, 'A', r, r, 0, largeArcFlag, 0, end.x, end.y].join(' ');
  };

  const bgArc = describeArc(center, center, radius, -135, 135);
  const activeArc = angle > -135 ? describeArc(center, center, radius, -135, angle) : '';

  // Drag interaction
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartY.current = e.clientY;
    dragStartVal.current = value;
    sound.tick();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    dragStartY.current = e.touches[0].clientY;
    dragStartVal.current = value;
    sound.tick();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaY = dragStartY.current - e.clientY;
      const range = max - min;
      const deltaVal = (deltaY / 150) * range;
      let newVal = dragStartVal.current + deltaVal;
      newVal = Math.round(newVal / step) * step;
      newVal = Math.max(min, Math.min(max, newVal));
      if (newVal !== value) {
        sound.tick();
        onChange(newVal);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      const deltaY = dragStartY.current - e.touches[0].clientY;
      const range = max - min;
      const deltaVal = (deltaY / 150) * range;
      let newVal = dragStartVal.current + deltaVal;
      newVal = Math.round(newVal / step) * step;
      newVal = Math.max(min, Math.min(max, newVal));
      if (newVal !== value) {
        sound.tick();
        onChange(newVal);
      }
    };

    const handleMouseUp = () => {
      if (isDragging) setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, max, min, onChange, step, value]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : 1;
    let newVal = value + dir * step;
    newVal = Math.max(min, Math.min(max, newVal));
    sound.tick();
    onChange(newVal);
  };

  return (
    <div 
      className="flex flex-col items-center select-none"
      onWheel={handleWheel}
    >
      <div className="text-[10px] uppercase font-bold tracking-widest text-[#A4A8B1] mb-1 font-mono">
        {label}
      </div>

      <div 
        ref={dialRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        style={{ width: size, height: size }}
        className={`relative cursor-ns-resize flex items-center justify-center bg-[#14161B] border border-[#343840] transition-shadow ${
          isDragging ? 'border-[#E5A962] ring-1 ring-[#E5A962]' : 'hover:border-[#E5A962]'
        }`}
      >
        <svg width={size} height={size} className="absolute inset-0 pointer-events-none">
          {/* Background track */}
          <path
            d={bgArc}
            fill="none"
            stroke="#22252B"
            strokeWidth={strokeWidth}
          />
          {/* Active illuminated arc */}
          {activeArc && (
            <path
              d={activeArc}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
            />
          )}

          {/* Tick mark graduations */}
          {Array.from({ length: 19 }).map((_, i) => {
            const tickAngle = -135 + (i / 18) * 270;
            const p1 = polarToCartesian(center, center, radius - 8, tickAngle);
            const p2 = polarToCartesian(center, center, radius - 3, tickAngle);
            const isMajor = i % 3 === 0;
            return (
              <line
                key={i}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={isMajor ? '#A4A8B1' : '#343840'}
                strokeWidth={isMajor ? 1.5 : 1}
              />
            );
          })}
        </svg>

        {/* Center Knob Head with Milled Notch */}
        <div 
          className="relative rounded-full flex items-center justify-center bg-[#191B20] border border-[#343840]"
          style={{ width: size * 0.58, height: size * 0.58 }}
        >
          {/* Pointer indicator line */}
          <div 
            className="absolute top-1 bottom-1 w-0.5 flex flex-col items-center justify-start pointer-events-none"
            style={{ transform: `rotate(${angle}deg)` }}
          >
            <div className="w-1.5 h-2.5 bg-[#E5A962] -translate-y-1" />
          </div>

          {/* Numerical Readout dead-center */}
          <div className="flex flex-col items-center justify-center pointer-events-none text-center px-1">
            <span className="font-mono font-black text-sm tracking-tighter text-[#F3F0EA] leading-none">
              {displayValue !== undefined ? displayValue : value}
            </span>
            {unit && (
              <span className="text-[9px] font-mono text-[#A4A8B1] tracking-wider mt-0.5 uppercase">
                {unit}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
