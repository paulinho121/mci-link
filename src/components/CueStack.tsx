import React, { useState, useEffect, useRef } from 'react';
import { Cue, Fixture } from '../types/cine';
import { sound } from '../utils/soundEffects';
import { kelvinToRgb } from '../utils/kelvinToRgb';
import { Play, Pause, SkipForward, SkipBack, Plus, Save, Trash2, Clock, CheckCircle } from 'lucide-react';

interface CueStackProps {
  cues: Cue[];
  activeCueId: string;
  onApplyCue: (cueId: string, duration?: number) => void;
  onRecordNewCue: (name: string, scene: string, fadeTime: number) => void;
  onUpdateCue: (cueId: string) => void;
  onDeleteCue: (cueId: string) => void;
  fixtures: Fixture[];
  isCrossfading: boolean;
  crossfadeProgress: number; // 0.0 - 1.0
}

export const CueStack: React.FC<CueStackProps> = ({
  cues,
  activeCueId,
  onApplyCue,
  onRecordNewCue,
  onUpdateCue,
  onDeleteCue,
  fixtures,
  isCrossfading,
  crossfadeProgress,
}) => {
  const [newCueName, setNewCueName] = useState('');
  const [newCueScene, setNewCueScene] = useState('SC-16');
  const [newCueFade, setNewCueFade] = useState(2.0);
  const [showNewCueModal, setShowNewCueModal] = useState(false);

  const activeIndex = cues.findIndex(c => c.id === activeCueId);
  const currentCue = cues[activeIndex] || cues[0];

  const handleGo = () => {
    sound.cueGo();
    const nextIndex = (activeIndex + 1) % cues.length;
    onApplyCue(cues[nextIndex].id, cues[nextIndex].fadeTime);
  };

  const handleBack = () => {
    sound.click();
    const prevIndex = (activeIndex - 1 + cues.length) % cues.length;
    onApplyCue(cues[prevIndex].id, cues[prevIndex].fadeTime);
  };

  const handleRecordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCueName.trim()) return;
    sound.click();
    onRecordNewCue(newCueName.trim(), newCueScene, newCueFade);
    setNewCueName('');
    setShowNewCueModal(false);
  };

  return (
    <div className="flex flex-col h-full bg-[#101114] p-3 overflow-hidden select-none space-y-3">
      {/* Top Playback Rail: Big GO button and crossfade monitor */}
      <div className="bg-[#191B20] p-3 border border-[#343840] flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Playback Controls */}
        <div className="flex items-center space-x-2 w-full md:w-auto">
          {/* Large Cinema "GO" Actuator */}
          <button
            onClick={handleGo}
            className="h-14 px-8 bg-[#E5A962] text-[#101114] font-heading font-black text-lg tracking-wider border border-[#E5A962] hover:bg-[#D99B52] active:scale-95 flex items-center space-x-2 chamfer-cut shadow-md"
          >
            <Play className="w-6 h-6 fill-current" />
            <span>GO CUE</span>
          </button>

          {/* Back Step */}
          <button
            onClick={handleBack}
            className="h-14 px-4 bg-[#22252B] text-[#F3F0EA] border border-[#343840] hover:border-[#E5A962] flex items-center space-x-1 font-mono text-xs font-bold"
          >
            <SkipBack className="w-4 h-4" />
            <span>BACK</span>
          </button>

          {/* Record Current Look */}
          <button
            onClick={() => { sound.click(); setShowNewCueModal(true); }}
            className="h-14 px-4 bg-[#22252B] text-[#71E7A5] border border-[#343840] hover:border-[#71E7A5] flex items-center space-x-1 font-mono text-xs font-bold"
          >
            <Plus className="w-4 h-4" />
            <span>STORE LOOK</span>
          </button>

          {/* Update Current Cue */}
          <button
            onClick={() => { sound.click(); onUpdateCue(currentCue.id); }}
            className="h-14 px-4 bg-[#22252B] text-[#A4A8B1] border border-[#343840] hover:text-[#E5A962] hover:border-[#E5A962] flex items-center space-x-1 font-mono text-xs font-bold"
            title="Overwrite selected cue with current stage values"
          >
            <Save className="w-4 h-4" />
            <span>UPDATE CUE</span>
          </button>
        </div>

        {/* Live Crossfade Progress Bar & Current Status */}
        <div className="flex-1 max-w-md w-full bg-[#14161B] p-2.5 border border-[#343840]">
          <div className="flex justify-between items-center text-xs font-mono mb-1">
            <span className="text-[#A4A8B1]">ACTIVE LOOK:</span>
            <span className="text-[#E5A962] font-black">
              CUE {currentCue?.number} • {currentCue?.name}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-3 bg-[#101114] border border-[#343840] relative overflow-hidden">
            <div
              className="h-full bg-[#E5A962] transition-all duration-75"
              style={{ width: `${isCrossfading ? crossfadeProgress * 100 : 100}%` }}
            />
          </div>

          <div className="flex justify-between items-center text-[10px] font-mono text-[#A4A8B1] mt-1">
            <span>{isCrossfading ? 'TRANSITION IN PROGRESS...' : 'HOLD / READY'}</span>
            <span className="text-[#F3F0EA]">FADE: {currentCue?.fadeTime}s</span>
          </div>
        </div>
      </div>

      {/* Cue List Table */}
      <div className="flex-1 bg-[#14161B] border border-[#343840] overflow-y-auto">
        <table className="w-full text-left font-mono text-xs border-collapse">
          <thead>
            <tr className="bg-[#191B20] text-[#A4A8B1] border-b border-[#343840] uppercase text-[10px] tracking-wider">
              <th className="p-2.5 w-16">CUE</th>
              <th className="p-2.5 w-24">SCENE</th>
              <th className="p-2.5">NAME & DESCRIPTION</th>
              <th className="p-2.5 w-28">FADE TIME</th>
              <th className="p-2.5 w-48">FIXTURE MATRIX</th>
              <th className="p-2.5 w-28 text-right">ACTION</th>
            </tr>
          </thead>
          <tbody>
            {cues.map((cue, idx) => {
              const isActive = cue.id === activeCueId;
              return (
                <tr
                  key={cue.id}
                  onClick={() => {
                    sound.click();
                    onApplyCue(cue.id, cue.fadeTime);
                  }}
                  className={`border-b border-[#292A2D] cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-[#22252B] text-[#F3F0EA] border-l-4 border-l-[#E5A962]'
                      : 'hover:bg-[#191B20] text-[#A4A8B1]'
                  }`}
                >
                  <td className="p-2.5 font-black text-sm">
                    <span className={isActive ? 'text-[#E5A962]' : 'text-[#F3F0EA]'}>
                      {cue.number}
                    </span>
                  </td>
                  <td className="p-2.5">
                    <span className="px-1.5 py-0.5 bg-[#101114] border border-[#343840] text-[10px] text-[#A4A8B1]">
                      {cue.scene}
                    </span>
                  </td>
                  <td className="p-2.5">
                    <div className="font-heading font-bold text-sm text-[#F3F0EA]">{cue.name}</div>
                    <div className="text-[10px] text-[#A4A8B1] truncate max-w-md">{cue.notes}</div>
                  </td>
                  <td className="p-2.5">
                    <div className="flex items-center space-x-1 text-[#E5A962]">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="font-bold">{cue.fadeTime.toFixed(1)}s</span>
                    </div>
                  </td>
                  <td className="p-2.5">
                    {/* Color Swatch Dots for Fixtures in this Cue */}
                    <div className="flex items-center space-x-1">
                      {fixtures.map((f) => {
                        const snap = cue.fixturesSnapshot[f.id];
                        if (!snap) return null;
                        const c = kelvinToRgb(snap.cct, snap.tint);
                        return (
                          <div
                            key={f.id}
                            title={`${f.tag}: ${snap.dimmer}% @ ${snap.cct}K`}
                            className="w-3.5 h-3.5 border border-[#101114]"
                            style={{
                              backgroundColor: snap.power ? c.hex : '#101114',
                              opacity: snap.power ? Math.max(0.2, snap.dimmer / 100) : 0.1,
                            }}
                          />
                        );
                      })}
                    </div>
                  </td>
                  <td className="p-2.5 text-right">
                    <div className="flex items-center justify-end space-x-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          sound.cueGo();
                          onApplyCue(cue.id, cue.fadeTime);
                        }}
                        className={`px-2.5 py-1 text-[10px] font-bold border ${
                          isActive
                            ? 'bg-[#E5A962] text-[#101114] border-[#E5A962]'
                            : 'bg-[#191B20] text-[#F3F0EA] border-[#343840] hover:border-[#E5A962]'
                        }`}
                      >
                        {isActive ? 'CURRENT' : 'FIRE'}
                      </button>
                      {cues.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            sound.click();
                            onDeleteCue(cue.id);
                          }}
                          className="p-1 bg-[#191B20] text-red-400 border border-[#343840] hover:bg-red-500 hover:text-white"
                          title="Delete Cue"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Record New Cue Modal */}
      {showNewCueModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <form 
            onSubmit={handleRecordSubmit}
            className="w-full max-w-md bg-[#191B20] border-2 border-[#E5A962] p-5 space-y-4 shadow-2xl"
          >
            <div className="flex justify-between items-center border-b border-[#343840] pb-2">
              <span className="font-heading font-black text-base text-[#E5A962]">
                RECORD STAGE LOOK AS CUE
              </span>
              <button
                type="button"
                onClick={() => setShowNewCueModal(false)}
                className="text-xs text-[#A4A8B1] hover:text-white"
              >
                ESC
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-[#A4A8B1] mb-1 uppercase font-bold">CUE NAME</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SCENE 16 - MOONLIGHT CLOSEUP"
                  value={newCueName}
                  onChange={(e) => setNewCueName(e.target.value)}
                  className="w-full bg-[#101114] border border-[#343840] p-2 text-[#F3F0EA] focus:border-[#E5A962] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[#A4A8B1] mb-1 uppercase font-bold">SCENE TAG</label>
                  <input
                    type="text"
                    value={newCueScene}
                    onChange={(e) => setNewCueScene(e.target.value)}
                    className="w-full bg-[#101114] border border-[#343840] p-2 text-[#F3F0EA] focus:border-[#E5A962] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[#A4A8B1] mb-1 uppercase font-bold">FADE TIME (S)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="60"
                    value={newCueFade}
                    onChange={(e) => setNewCueFade(Number(e.target.value))}
                    className="w-full bg-[#101114] border border-[#343840] p-2 text-[#F3F0EA] focus:border-[#E5A962] outline-none"
                  />
                </div>
              </div>

              <div className="p-2 bg-[#14161B] border border-[#343840] text-[11px] text-[#A4A8B1]">
                Snapshot will capture levels and CCTs from {fixtures.length} online fixtures.
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewCueModal(false)}
                className="px-4 py-2 bg-[#22252B] text-[#F3F0EA] border border-[#343840] font-mono text-xs"
              >
                CANCEL
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-[#E5A962] text-[#101114] font-mono font-bold text-xs border border-[#E5A962]"
              >
                CONFIRM & STORE
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
