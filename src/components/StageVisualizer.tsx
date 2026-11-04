import React, { useRef, useState } from 'react';
import { Fixture } from '../types/cine';
import { kelvinToRgb } from '../utils/kelvinToRgb';
import { sound } from '../utils/soundEffects';
import { Camera, Crosshair, Move, RotateCw, ZoomIn, Eye, EyeOff } from 'lucide-react';

interface StageVisualizerProps {
  fixtures: Fixture[];
  selectedFixtureId: string;
  onSelectFixture: (id: string) => void;
  onUpdateFixture: (id: string, updates: Partial<Fixture>) => void;
  blackoutActive: boolean;
}

export const StageVisualizer: React.FC<StageVisualizerProps> = ({
  fixtures,
  selectedFixtureId,
  onSelectFixture,
  onUpdateFixture,
  blackoutActive,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [showBeams, setShowBeams] = useState(true);
  const [showGrid, setShowGrid] = useState(true);

  // Subject mark coordinates (center of the stage)
  const actorPos = { x: 500, y: 460 };
  const cameraPos = { x: 500, y: 880 };

  const handlePointerDown = (e: React.PointerEvent, fixId: string, isRotateHandle = false) => {
    e.stopPropagation();
    sound.tick();
    onSelectFixture(fixId);
    if (isRotateHandle) {
      setRotatingId(fixId);
    } else {
      setDraggingId(fixId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const curX = ((e.clientX - rect.left) / rect.width) * 1000;
    const curY = ((e.clientY - rect.top) / rect.height) * 1000;

    if (draggingId) {
      const clampedX = Math.max(50, Math.min(950, curX));
      const clampedY = Math.max(50, Math.min(950, curY));
      onUpdateFixture(draggingId, {
        x: Math.round(clampedX),
        y: Math.round(clampedY),
      });
    } else if (rotatingId) {
      const fix = fixtures.find(f => f.id === rotatingId);
      if (fix) {
        const dx = curX - fix.x;
        const dy = curY - fix.y;
        let deg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI) + 90;
        if (deg < 0) deg += 360;
        onUpdateFixture(rotatingId, { rotation: deg });
      }
    }
  };

  const handlePointerUp = () => {
    setDraggingId(null);
    setRotatingId(null);
  };

  const selectedFixture = fixtures.find(f => f.id === selectedFixtureId) || fixtures[0];

  return (
    <div 
      className="flex flex-col lg:flex-row h-full bg-[#101114] p-3 gap-3 overflow-hidden select-none"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* 2D Stage Canvas Map */}
      <div 
        ref={containerRef}
        className={`flex-1 relative bg-[#14161B] border border-[#343840] overflow-hidden min-h-[480px] ${
          showGrid ? 'grid-ruled' : ''
        }`}
      >
        {/* Stage Coordinate Markers */}
        <div className="absolute top-2 left-2 text-[10px] font-mono text-[#A4A8B1] flex items-center space-x-2 pointer-events-none">
          <span className="px-1.5 py-0.5 bg-[#101114] border border-[#343840] text-[#E5A962] font-bold">
            STAGE 4 - MAIN RIG
          </span>
          <span>GRID: 20m x 20m</span>
        </div>

        {/* View Controls Toolbar */}
        <div className="absolute top-2 right-2 flex items-center space-x-1.5 z-20">
          <button
            onClick={() => { sound.click(); setShowBeams(!showBeams); }}
            className={`px-2 py-1 text-[10px] font-mono font-bold border flex items-center space-x-1 ${
              showBeams ? 'bg-[#22252B] text-[#E5A962] border-[#E5A962]' : 'bg-[#191B20] text-[#A4A8B1] border-[#343840]'
            }`}
          >
            {showBeams ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            <span>BEAMS</span>
          </button>
          <button
            onClick={() => { sound.click(); setShowGrid(!showGrid); }}
            className={`px-2 py-1 text-[10px] font-mono font-bold border ${
              showGrid ? 'bg-[#22252B] text-[#E5A962] border-[#E5A962]' : 'bg-[#191B20] text-[#A4A8B1] border-[#343840]'
            }`}
          >
            GRID
          </button>
        </div>

        {/* Studio Trusses (Overhead Rigging) */}
        <div className="absolute inset-x-8 top-[15%] h-px bg-[#343840] pointer-events-none opacity-60">
          <span className="absolute -top-3.5 left-2 text-[8px] font-mono text-[#A4A8B1]">TRUSS A (CYC / BACKLIGHT)</span>
        </div>
        <div className="absolute inset-x-8 top-[40%] h-px bg-[#343840] pointer-events-none opacity-60">
          <span className="absolute -top-3.5 left-2 text-[8px] font-mono text-[#A4A8B1]">TRUSS B (TOP / RIM)</span>
        </div>
        <div className="absolute inset-x-8 top-[75%] h-px bg-[#343840] pointer-events-none opacity-60">
          <span className="absolute -top-3.5 left-2 text-[8px] font-mono text-[#A4A8B1]">TRUSS C (FRONT / KEY)</span>
        </div>

        {/* Center Actor / Subject Mark */}
        <div 
          className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none z-10"
          style={{ left: `${actorPos.x / 10}%`, top: `${actorPos.y / 10}%` }}
        >
          <div className="w-9 h-9 border border-dashed border-[#E6B45F] flex items-center justify-center">
            <Crosshair className="w-5 h-5 text-[#E6B45F] animate-pulse" />
          </div>
          <span className="text-[9px] font-mono font-bold text-[#E6B45F] bg-[#101114] px-1 border border-[#343840] mt-1">
            SUBJECT MARK 1
          </span>
        </div>

        {/* Camera Position Mark */}
        <div 
          className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none z-10"
          style={{ left: `${cameraPos.x / 10}%`, top: `${cameraPos.y / 10}%` }}
        >
          <div className="w-8 h-8 bg-[#191B20] border border-[#52C98A] flex items-center justify-center shadow">
            <Camera className="w-4 h-4 text-[#52C98A]" />
          </div>
          <span className="text-[8px] font-mono font-bold text-[#52C98A] bg-[#101114] px-1 border border-[#343840] mt-1">
            CAM A • ARRI ALEXA 35
          </span>
        </div>

        {/* SVG Light Beam Projections */}
        {showBeams && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden">
            <defs>
              {fixtures.map((f) => {
                const color = kelvinToRgb(f.cct, f.tint);
                return (
                  <linearGradient key={`grad-${f.id}`} id={`grad-${f.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={color.hex} stopOpacity="0.55" />
                    <stop offset="60%" stopColor={color.hex} stopOpacity="0.22" />
                    <stop offset="100%" stopColor={color.hex} stopOpacity="0.0" />
                  </linearGradient>
                );
              })}
            </defs>

            {fixtures.map((f) => {
              const isLit = f.power && !f.muted && !blackoutActive && f.dimmer > 0;
              if (!isLit) return null;

              const throwDistance = 280 * (f.dimmer / 100);
              const halfSpread = (f.beamAngle / 2) * (Math.PI / 180);
              const spreadWidth = Math.tan(halfSpread) * throwDistance;

              // Cone polygon coordinates centered at (f.x, f.y) rotated by f.rotation
              const points = [
                `${f.x / 10}%,${f.y / 10}%`,
                `calc(${f.x / 10}% - ${spreadWidth * 0.7}px),calc(${f.y / 10}% + ${throwDistance * 0.7}px)`,
                `calc(${f.x / 10}% + ${spreadWidth * 0.7}px),calc(${f.y / 10}% + ${throwDistance * 0.7}px)`,
              ].join(' ');

              return (
                <g 
                  key={`beam-${f.id}`} 
                  style={{
                    transformOrigin: `${f.x / 10}% ${f.y / 10}%`,
                    transform: `rotate(${f.rotation - 180}deg)`,
                  }}
                >
                  <polygon
                    points={points}
                    fill={`url(#grad-${f.id})`}
                    className="transition-all duration-100"
                  />
                </g>
              );
            })}
          </svg>
        )}

        {/* Fixture Hardware Nodes */}
        {fixtures.map((f) => {
          const isSelected = f.id === selectedFixtureId;
          const color = kelvinToRgb(f.cct, f.tint);
          const isLit = f.power && !f.muted && !blackoutActive && f.dimmer > 0;

          return (
            <div
              key={f.id}
              onPointerDown={(e) => handlePointerDown(e, f.id, false)}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-20"
              style={{ left: `${f.x / 10}%`, top: `${f.y / 10}%` }}
            >
              <div 
                className={`relative flex flex-col items-center group`}
              >
                {/* Physical Fixture Housing Body */}
                <div 
                  className={`w-9 h-9 bg-[#22252B] border flex items-center justify-center transition-all ${
                    isSelected
                      ? 'border-[#E5A962] ring-2 ring-[#E5A962] shadow-[0_0_10px_#E5A962]'
                      : 'border-[#343840] hover:border-[#F3F0EA]'
                  }`}
                  style={{
                    boxShadow: isLit ? `0 0 12px ${color.hex}` : undefined
                  }}
                >
                  {/* Internal lamp emission preview */}
                  <div 
                    className="w-4 h-4 border border-[#101114]"
                    style={{ 
                      backgroundColor: isLit ? color.hex : '#101114',
                      opacity: isLit ? f.dimmer / 100 : 0.2 
                    }}
                  />

                  {/* Orientation Pointer Notch */}
                  <div 
                    className="absolute -top-1 w-2 h-1 bg-[#E5A962]"
                    style={{ transform: `rotate(${f.rotation}deg)` }}
                  />
                </div>

                {/* Tag & Metric Label */}
                <div className="absolute top-10 whitespace-nowrap flex flex-col items-center pointer-events-none">
                  <span className={`text-[9px] font-mono font-black px-1 py-0.2 border ${
                    isSelected ? 'bg-[#E5A962] text-[#101114] border-[#E5A962]' : 'bg-[#191B20] text-[#F3F0EA] border-[#343840]'
                  }`}>
                    {f.tag} ({f.dimmer.toFixed(0)}%)
                  </span>
                  <span className="text-[8px] font-mono text-[#A4A8B1]">
                    {f.cct}K
                  </span>
                </div>

                {/* Rotation Handle when Selected */}
                {isSelected && (
                  <div
                    onPointerDown={(e) => handlePointerDown(e, f.id, true)}
                    className="absolute -top-6 w-5 h-5 bg-[#E5A962] text-[#101114] flex items-center justify-center cursor-pointer border border-[#101114] hover:scale-110"
                    title="Drag to Rotate Pan Angle"
                  >
                    <RotateCw className="w-3 h-3" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Side Inspector Panel for Selected Fixture */}
      <div className="w-full lg:w-80 bg-[#191B20] border border-[#343840] p-3 flex flex-col justify-between">
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-[#343840] pb-2">
            <div>
              <div className="text-[10px] font-mono text-[#E5A962] font-bold tracking-widest uppercase">
                SELECTED FIXTURE
              </div>
              <div className="font-heading font-black text-sm text-[#F3F0EA]">
                {selectedFixture.tag} • {selectedFixture.name}
              </div>
            </div>
            <span className="px-2 py-0.5 bg-[#22252B] border border-[#343840] text-[10px] font-mono text-[#52C98A]">
              U{selectedFixture.universe}:{selectedFixture.startAddress}
            </span>
          </div>

          {/* Position & Angle Controls */}
          <div className="bg-[#14161B] p-2.5 border border-[#343840] space-y-2">
            <div className="text-[10px] font-mono text-[#A4A8B1] uppercase font-bold flex items-center justify-between">
              <span>RIG POSITION</span>
              <span>X: {selectedFixture.x} | Y: {selectedFixture.y}</span>
            </div>

            {/* Rotation Pan Slider */}
            <div>
              <div className="flex justify-between text-[10px] font-mono text-[#A4A8B1] mb-1">
                <span>PAN ROTATION</span>
                <span className="text-[#E5A962] font-bold">{selectedFixture.rotation}°</span>
              </div>
              <input
                type="range"
                min={0}
                max={360}
                value={selectedFixture.rotation}
                onChange={(e) => onUpdateFixture(selectedFixture.id, { rotation: Number(e.target.value) })}
                className="w-full accent-[#E5A962] bg-[#22252B] cursor-pointer"
              />
            </div>

            {/* Beam Angle Slider */}
            <div>
              <div className="flex justify-between text-[10px] font-mono text-[#A4A8B1] mb-1">
                <span>BEAM SPREAD</span>
                <span className="text-[#E5A962] font-bold">{selectedFixture.beamAngle}°</span>
              </div>
              <input
                type="range"
                min={15}
                max={90}
                value={selectedFixture.beamAngle}
                onChange={(e) => onUpdateFixture(selectedFixture.id, { beamAngle: Number(e.target.value) })}
                className="w-full accent-[#E5A962] bg-[#22252B] cursor-pointer"
              />
            </div>
          </div>

          {/* Quick Aim Buttons toward Stage Marks */}
          <div className="space-y-1">
            <div className="text-[10px] font-mono text-[#A4A8B1] uppercase font-bold">
              AUTOTRACK / AUTO-AIM TARGET:
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => {
                  sound.click();
                  const dx = actorPos.x - selectedFixture.x;
                  const dy = actorPos.y - selectedFixture.y;
                  let deg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI) + 90;
                  if (deg < 0) deg += 360;
                  onUpdateFixture(selectedFixture.id, { rotation: deg });
                }}
                className="py-1.5 px-2 bg-[#22252B] border border-[#343840] text-xs font-mono font-bold text-[#E6B45F] hover:border-[#E6B45F]"
              >
                🎯 AIM SUBJECT
              </button>
              <button
                onClick={() => {
                  sound.click();
                  const dx = cameraPos.x - selectedFixture.x;
                  const dy = cameraPos.y - selectedFixture.y;
                  let deg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI) + 90;
                  if (deg < 0) deg += 360;
                  onUpdateFixture(selectedFixture.id, { rotation: deg });
                }}
                className="py-1.5 px-2 bg-[#22252B] border border-[#343840] text-xs font-mono font-bold text-[#52C98A] hover:border-[#52C98A]"
              >
                🎥 AIM CAMERA
              </button>
            </div>
          </div>

          {/* Fixture Physical Telemetry */}
          <div className="bg-[#14161B] p-2 border border-[#343840] text-xs font-mono space-y-1">
            <div className="flex justify-between">
              <span className="text-[#A4A8B1]">TEMPERATURE:</span>
              <span className={selectedFixture.temperature > 50 ? 'text-[#E6B45F] font-bold' : 'text-[#F3F0EA]'}>
                {selectedFixture.temperature.toFixed(1)}°C (NORMAL)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#A4A8B1]">CRMX SIGNAL:</span>
              <span className="text-[#52C98A] font-bold">{selectedFixture.rssi} dBm (EXCELLENT)</span>
            </div>
            {selectedFixture.battery !== undefined && (
              <div className="flex justify-between">
                <span className="text-[#A4A8B1]">BATTERY LEVEL:</span>
                <span className="text-[#52C98A] font-bold">{selectedFixture.battery}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Quick Power / Mute / Solo Bottom Bar */}
        <div className="pt-3 border-t border-[#343840] grid grid-cols-2 gap-1.5">
          <button
            onClick={() => {
              sound.click();
              onUpdateFixture(selectedFixture.id, { solo: !selectedFixture.solo });
            }}
            className={`py-1.5 text-xs font-mono font-bold border ${
              selectedFixture.solo ? 'bg-[#E6B45F] text-[#101114] border-[#E6B45F]' : 'bg-[#22252B] text-[#A4A8B1] border-[#343840]'
            }`}
          >
            SOLO FIXTURE
          </button>
          <button
            onClick={() => {
              sound.click();
              onUpdateFixture(selectedFixture.id, { power: !selectedFixture.power });
            }}
            className={`py-1.5 text-xs font-mono font-bold border ${
              selectedFixture.power ? 'bg-[#52C98A] text-[#101114] border-[#52C98A]' : 'bg-[#22252B] text-[#A4A8B1] border-[#343840]'
            }`}
          >
            {selectedFixture.power ? 'POWER ON' : 'POWER OFF'}
          </button>
        </div>
      </div>
    </div>
  );
};
