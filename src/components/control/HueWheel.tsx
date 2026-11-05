import React, { useRef } from 'react';

interface HueWheelProps {
  hue: number;
  saturation: number;
  onChange: (hue: number, saturation: number) => void;
}

/** Hue around the ring, saturation from centre (0%) to edge (100%). */
export const HueWheel: React.FC<HueWheelProps> = ({ hue, saturation, onChange }) => {
  const ref = useRef<HTMLDivElement>(null);

  const handle = (clientX: number, clientY: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const radius = rect.width / 2;
    // 0° at top, clockwise — matches the conic gradient below.
    const h = Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360);
    const s = Math.round(Math.min(1, Math.sqrt(dx * dx + dy * dy) / radius) * 100);
    onChange(h, s);
  };

  const rad = (hue * Math.PI) / 180;
  const r = (saturation / 100) * 50;
  const cx = 50 + Math.sin(rad) * r;
  const cy = 50 - Math.cos(rad) * r;

  return (
    <div
      ref={ref}
      role="slider"
      aria-label="Hue and saturation"
      aria-valuetext={`Hue ${hue}°, saturation ${saturation}%`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') onChange((hue + 5) % 360, saturation);
        if (e.key === 'ArrowLeft') onChange((hue + 355) % 360, saturation);
        if (e.key === 'ArrowUp') onChange(hue, Math.min(100, saturation + 5));
        if (e.key === 'ArrowDown') onChange(hue, Math.max(0, saturation - 5));
      }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); handle(e.clientX, e.clientY); }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) handle(e.clientX, e.clientY); }}
      className="relative w-full max-w-[300px] aspect-square cursor-crosshair touch-none focus:outline-none"
    >
      {/* clip-path instead of border-radius: index.css forces square corners */}
      <div
        className="absolute inset-0"
        style={{
          clipPath: 'circle(50%)',
          background:
            'radial-gradient(circle closest-side, #fff 0%, rgba(255,255,255,0) 100%), conic-gradient(from 0deg, red, yellow, lime, cyan, blue, magenta, red)',
        }}
      />
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
        <circle cx="50" cy="50" r="49.6" fill="none" stroke="#343840" strokeWidth="0.8" />
        <circle cx={cx} cy={cy} r="4" fill={`hsl(${hue}, ${saturation}%, ${50 + (100 - saturation) / 4}%)`} stroke="#101114" strokeWidth="1.6" />
        <circle cx={cx} cy={cy} r="5.2" fill="none" stroke="#F3F0EA" strokeWidth="0.9" />
      </svg>
    </div>
  );
};
