import React from 'react';
import { CinematicLight, POSITION_ANGLE } from './types';
import { lightCss } from './swatch';

interface SchemeLight {
  key: string;
  light: CinematicLight;
  /** Override angle (adapted plans place merged lights between positions). */
  angle?: number;
  label: string;
  sublabel?: string;
}

/**
 * Top view of the set: subject in the centre, camera at the bottom, each
 * light around the subject at its position, coloured and sized by intensity.
 * A conceptual diagram, not a light simulation.
 */
export const LightingScheme: React.FC<{ lights: SchemeLight[] }> = ({ lights }) => {
  const C = 110;
  return (
    <figure className="flex flex-col items-center">
      <svg viewBox="0 0 220 220" className="w-full max-w-[300px]" role="img" aria-label="Top view of the lighting setup">
        <defs>
          <pattern id="cl-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#22252B" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width="220" height="220" fill="#101114" />
        <rect width="220" height="220" fill="url(#cl-grid)" />
        {/* background wall */}
        <line x1="20" y1="14" x2="200" y2="14" stroke="#343840" strokeWidth="3" />
        <text x="110" y="10" textAnchor="middle" fontSize="6" fill="#6B7079" fontFamily="monospace">BACKGROUND</text>
        {/* camera */}
        <g transform={`translate(${C} 204)`}>
          <rect x="-9" y="-6" width="18" height="11" fill="#22252B" stroke="#A4A8B1" strokeWidth="1" />
          <polygon points="-5,-6 5,-6 8,-13 -8,-13" fill="#22252B" stroke="#A4A8B1" strokeWidth="1" />
          <text x="0" y="13" textAnchor="middle" fontSize="6" fill="#A4A8B1" fontFamily="monospace">CAM</text>
        </g>
        {/* subject */}
        <circle cx={C} cy={C} r="11" fill="#2A2D34" stroke="#F3F0EA" strokeWidth="1.2" />
        <circle cx={C} cy={C + 7} r="2.5" fill="#F3F0EA" />
        {lights.map(({ key, light, angle, label, sublabel }) => {
          const a = ((angle ?? POSITION_ANGLE[light.position]) * Math.PI) / 180;
          const top = light.position === 'TOP';
          const bg = light.position === 'BACKGROUND';
          const r = bg ? 88 : top ? 0 : Math.min(80, 34 + light.distanceM * 13);
          const x = bg ? C + Math.sin(a) * 30 + (Number(key.replace(/\D/g, '')) % 3 - 1) * 26 : C + Math.sin(a) * r;
          const y = bg ? 26 : top ? C - 26 : C + Math.cos(a) * r;
          const color = lightCss(light);
          const size = 5 + (light.intensity / 100) * 5;
          const beamTo = bg ? { x, y: 14 } : { x: C, y: C };
          return (
            <g key={key}>
              <line x1={x} y1={y} x2={beamTo.x} y2={beamTo.y} stroke={color} strokeOpacity={0.25 + light.intensity / 200} strokeWidth={1.5 + light.intensity / 30} strokeDasharray={top ? '2 2' : undefined} />
              <circle cx={x} cy={y} r={size + 4} fill={color} opacity={0.15} />
              <circle cx={x} cy={y} r={size} fill={color} stroke="#101114" strokeWidth="1" />
              <text x={x} y={y + size + 8} textAnchor="middle" fontSize="6.5" fontWeight="bold" fill="#F3F0EA" fontFamily="monospace">{label}</text>
              {sublabel && (
                <text x={x} y={y + size + 15} textAnchor="middle" fontSize="5.5" fill="#A4A8B1" fontFamily="monospace">{sublabel}</text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="text-[9px] font-mono text-[#6B7079] text-center mt-1">
        Conceptual top view. Not a prediction of the real exposure or light falloff.
      </figcaption>
    </figure>
  );
};
