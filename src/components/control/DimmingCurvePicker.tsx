import React from 'react';
import { DimmingCurve } from '../../types/cine';
import { DIMMING_CURVES, applyCurve } from '../../utils/color';
import { sound } from '../../utils/soundEffects';

const curvePath = (curve: DimmingCurve) => {
  const pts: string[] = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    pts.push(`${4 + t * 32},${36 - applyCurve(t, curve) * 32}`);
  }
  return `M${pts.join(' L')}`;
};

interface DimmingCurvePickerProps {
  value: DimmingCurve;
  onChange: (c: DimmingCurve) => void;
}

export const DimmingCurvePicker: React.FC<DimmingCurvePickerProps> = ({ value, onChange }) => (
  <div className="flex flex-col items-center space-y-2">
    <div className="px-2.5 py-0.5 bg-[#101114] border border-[#343840] font-mono font-bold text-xs text-[#F3F0EA]">
      {DIMMING_CURVES.find((c) => c.id === value)?.label}
    </div>
    <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Dimming curve">
      {DIMMING_CURVES.map((c) => (
        <button
          key={c.id}
          role="radio"
          aria-checked={value === c.id}
          title={c.label}
          onClick={() => { sound.click(); onChange(c.id); }}
          className={`w-12 h-12 flex items-center justify-center border ${
            value === c.id ? 'bg-[#E5A962]/15 border-[#E5A962]' : 'bg-[#191B20] border-[#343840] hover:border-[#A4A8B1]'
          }`}
        >
          <svg viewBox="0 0 40 40" className="w-8 h-8">
            <path d={curvePath(c.id)} fill="none" stroke={value === c.id ? '#E5A962' : '#A4A8B1'} strokeWidth="2.5" />
          </svg>
        </button>
      ))}
    </div>
  </div>
);
