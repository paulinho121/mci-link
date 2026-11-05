import React, { useEffect, useRef } from 'react';
import { GAMUTS, GamutId, SPECTRAL_LOCUS, XY, clampToGamut, pointInPolygon, xyToRgb } from '../../utils/color';

interface CieDiagramProps {
  value: XY;
  gamut: GamutId;
  onChange: (xy: XY) => void;
}

// Plot window in chromaticity units.
const X_MAX = 0.8;
const Y_MAX = 0.9;
const SIZE = 300; // canvas pixels (square)
const PAD = 26;

const toPx = (p: XY) => ({
  px: PAD + (p.x / X_MAX) * (SIZE - PAD - 8),
  py: SIZE - PAD - (p.y / Y_MAX) * (SIZE - PAD - 8),
});
const fromPx = (px: number, py: number): XY => ({
  x: ((px - PAD) / (SIZE - PAD - 8)) * X_MAX,
  y: ((SIZE - PAD - py) / (SIZE - PAD - 8)) * Y_MAX,
});

export const CieDiagram: React.FC<CieDiagramProps> = ({ value, gamut, onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tri = GAMUTS[gamut].points;

  // Paint the horseshoe once.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(SIZE, SIZE);
    for (let py = 0; py < SIZE; py++) {
      for (let px = 0; px < SIZE; px++) {
        const p = fromPx(px, py);
        if (p.x < 0 || p.y <= 0 || !pointInPolygon(p, SPECTRAL_LOCUS)) continue;
        const { r, g, b } = xyToRgb(p);
        const i = (py * SIZE + px) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = 235;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, []);

  const handlePointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * SIZE;
    const py = ((e.clientY - rect.top) / rect.height) * SIZE;
    const p = clampToGamut(fromPx(px, py), tri);
    onChange({ x: Math.round(p.x * 10000) / 10000, y: Math.round(p.y * 10000) / 10000 });
  };

  const point = toPx(value);
  const triPts = tri.map((p) => { const { px, py } = toPx(p); return `${px},${py}`; }).join(' ');
  const ticksX = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
  const ticksY = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

  return (
    <div className="relative w-full max-w-[340px] aspect-square">
      <canvas ref={canvasRef} width={SIZE} height={SIZE} className="absolute inset-0 w-full h-full" />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); handlePointer(e); }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) handlePointer(e); }}
        role="img"
        aria-label={`CIE 1931 diagram, x ${value.x.toFixed(4)} y ${value.y.toFixed(4)}`}
      >
        {/* axes + ticks */}
        <line x1={PAD} y1={SIZE - PAD} x2={SIZE - 4} y2={SIZE - PAD} stroke="#343840" />
        <line x1={PAD} y1={SIZE - PAD} x2={PAD} y2={4} stroke="#343840" />
        {ticksX.map((t) => {
          const { px } = toPx({ x: t, y: 0 });
          return (
            <text key={`x${t}`} x={px} y={SIZE - PAD + 12} fill="#A4A8B1" fontSize="8" textAnchor="middle" fontFamily="monospace">
              {t.toFixed(1)}
            </text>
          );
        })}
        {ticksY.map((t) => {
          const { py } = toPx({ x: 0, y: t });
          return (
            <text key={`y${t}`} x={PAD - 4} y={py + 3} fill="#A4A8B1" fontSize="8" textAnchor="end" fontFamily="monospace">
              {t.toFixed(1)}
            </text>
          );
        })}
        <text x={SIZE - 6} y={SIZE - PAD - 4} fill="#A4A8B1" fontSize="9" textAnchor="end" fontFamily="monospace">x</text>
        <text x={PAD + 4} y={12} fill="#A4A8B1" fontSize="9" fontFamily="monospace">y</text>

        {/* gamut */}
        <polygon points={triPts} fill="none" stroke="#F3F0EA" strokeWidth="1.2" strokeDasharray="4 3" />

        {/* target */}
        <circle cx={point.px} cy={point.py} r="7" fill="none" stroke="#101114" strokeWidth="3" />
        <circle cx={point.px} cy={point.py} r="7" fill="none" stroke="#F3F0EA" strokeWidth="1.5" />
      </svg>
    </div>
  );
};
