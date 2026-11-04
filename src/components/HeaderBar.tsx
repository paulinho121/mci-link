import React, { useEffect, useState } from 'react';
import { 
  Sliders, 
  Layers, 
  Disc, 
  PlayCircle, 
  Zap, 
  Grid, 
  Volume2, 
  VolumeX, 
  Radio, 
  Cpu, 
  Activity,
  Film
} from 'lucide-react';
import { sound } from '../utils/soundEffects';

interface HeaderBarProps {
  activeTab: 'faders' | 'stage' | 'rotary' | 'cues' | 'fx' | 'dmx';
  setActiveTab: (tab: 'faders' | 'stage' | 'rotary' | 'cues' | 'fx' | 'dmx') => void;
  blackoutActive: boolean;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  activeTab,
  setActiveTab,
  blackoutActive,
}) => {
  const [soundEnabled, setSoundEnabled] = useState(sound.enabled);
  const [timecode, setTimecode] = useState('01:24:58:18');
  const [fps, setFps] = useState<number>(24);
  const [tcRunning, setTcRunning] = useState(true);

  // Timecode engine
  useEffect(() => {
    if (!tcRunning) return;
    const interval = setInterval(() => {
      setTimecode(prev => {
        const parts = prev.split(':').map(Number);
        let [h, m, s, f] = parts;
        f += 1;
        if (f >= fps) {
          f = 0;
          s += 1;
          if (s >= 60) {
            s = 0;
            m += 1;
            if (m >= 60) {
              m = 0;
              h += 1;
            }
          }
        }
        return [
          String(h).padStart(2, '0'),
          String(m).padStart(2, '0'),
          String(s).padStart(2, '0'),
          String(f).padStart(2, '0'),
        ].join(':');
      });
    }, 1000 / fps);

    return () => clearInterval(interval);
  }, [tcRunning, fps]);

  const toggleSound = () => {
    sound.enabled = !sound.enabled;
    setSoundEnabled(sound.enabled);
    if (sound.enabled) sound.click();
  };

  const handleTabChange = (tab: 'faders' | 'stage' | 'rotary' | 'cues' | 'fx' | 'dmx') => {
    sound.click();
    setActiveTab(tab);
  };

  return (
    <header className="bg-[#101114] border-b border-[#343840] select-none text-[#F3F0EA]">
      {/* Top Telemetry Hardware Rail */}
      <div className="h-10 px-3 bg-[#14161B] border-b border-[#292A2D] flex items-center justify-between text-xs font-mono">
        {/* Brand & System Status */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 font-bold tracking-wider">
            <span className="w-2.5 h-2.5 bg-[#E5A962] inline-block chamfer-badge" />
            <span className="text-[#E5A962] font-black text-sm tracking-widest font-heading">CINE LIGHT OS</span>
            <span className="text-[10px] text-[#A4A8B1] bg-[#1F1F23] px-1.5 py-0.5 border border-[#343840] chamfer-badge">
              v4.2.0-PRO
            </span>
          </div>

          <div className="h-4 w-px bg-[#343840]" />

          {/* Timecode Readout */}
          <div className="flex items-center space-x-2 bg-[#101114] px-2 py-0.5 border border-[#343840]">
            <Film className="w-3.5 h-3.5 text-[#E5A962]" />
            <span className="text-[#A4A8B1] text-[10px] font-bold">TC:</span>
            <span className="text-[#E5A962] font-bold tracking-widest text-[13px]">{timecode}</span>
            <button 
              onClick={() => { sound.click(); setTcRunning(!tcRunning); }}
              className={`text-[9px] px-1 py-0.2 font-bold ${tcRunning ? 'bg-[#52C98A] text-[#101114]' : 'bg-[#343840] text-[#A4A8B1]'}`}
            >
              {tcRunning ? 'REC' : 'HOLD'}
            </button>
            <select 
              value={fps} 
              onChange={(e) => { sound.tick(); setFps(Number(e.target.value)); }}
              aria-label="Timecode FPS selector"
              className="bg-transparent text-[#A4A8B1] text-[10px] border-none outline-none cursor-pointer"
            >
              <option value={24} className="bg-[#191B20]">24.00 FPS</option>
              <option value={23.976} className="bg-[#191B20]">23.98 FPS</option>
              <option value={25} className="bg-[#191B20]">25.00 FPS</option>
              <option value={29.97} className="bg-[#191B20]">29.97 FPS</option>
              <option value={48} className="bg-[#191B20]">48.00 FPS</option>
              <option value={120} className="bg-[#191B20]">120 FPS</option>
            </select>
          </div>
        </div>

        {/* Hardware Status: CRMX, Art-Net, Genset Load */}
        <div className="flex items-center space-x-3 text-[11px]">
          {/* CRMX TimoTwo */}
          <div className="flex items-center space-x-1.5 bg-[#191B20] px-2 py-0.5 border border-[#343840]">
            <Radio className="w-3.5 h-3.5 text-[#52C98A]" />
            <span className="text-[#A4A8B1] text-[10px] uppercase">CRMX</span>
            <span className="w-1.5 h-1.5 bg-[#52C98A]" />
            <span className="text-[#F3F0EA] font-bold text-[10px]">CH-18</span>
            <span className="text-[#52C98A] font-bold text-[10px]">-42dBm</span>
          </div>

          {/* Art-Net / sACN */}
          <div className="flex items-center space-x-1.5 bg-[#191B20] px-2 py-0.5 border border-[#343840] hidden sm:flex">
            <Cpu className="w-3.5 h-3.5 text-[#E5A962]" />
            <span className="text-[#A4A8B1] text-[10px] uppercase">ART-NET 4</span>
            <span className="text-[#F3F0EA] font-mono text-[10px]">192.168.1.150</span>
            <span className="text-[#E5A962] font-bold text-[10px]">44Hz</span>
          </div>

          {/* Generator / Power Load */}
          <div className="flex items-center space-x-1.5 bg-[#191B20] px-2 py-0.5 border border-[#343840] hidden md:flex">
            <Activity className="w-3.5 h-3.5 text-[#E6B45F]" />
            <span className="text-[#A4A8B1] text-[10px]">GENSET</span>
            <span className="text-[#F3F0EA] font-bold text-[10px]">240V / 32.4A</span>
            <span className="text-[#E6B45F] font-bold text-[10px]">7.8kW (68%)</span>
          </div>

          {/* Audio Click Feedback Toggle */}
          <button
            onClick={toggleSound}
            title={soundEnabled ? 'Mechanical Audio Feedback: ON' : 'Mechanical Audio Feedback: MUTED'}
            className={`p-1 border border-[#343840] transition-colors ${
              soundEnabled ? 'bg-[#22252B] text-[#E5A962] border-[#E5A962]' : 'bg-[#191B20] text-[#A4A8B1]'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 text-red-400" />}
          </button>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="h-12 px-3 bg-[#191B20] flex items-center justify-between">
        <nav className="flex space-x-1 h-full py-1 overflow-x-auto">
          {[
            { id: 'faders', label: 'FADER BAY', icon: Sliders, shortcut: 'F1' },
            { id: 'stage', label: 'STAGE 2D', icon: Layers, shortcut: 'F2' },
            { id: 'rotary', label: 'ENCODERS', icon: Disc, shortcut: 'F3' },
            { id: 'cues', label: 'CUE STACK', icon: PlayCircle, shortcut: 'F4' },
            { id: 'fx', label: 'FX ENGINE', icon: Zap, shortcut: 'F5' },
            { id: 'dmx', label: 'DMX MATRIX', icon: Grid, shortcut: 'F6' },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id as typeof activeTab)}
                className={`h-full px-3.5 flex items-center space-x-2 border transition-all text-xs font-bold tracking-wider ${
                  isActive
                    ? 'bg-[#E5A962] text-[#101114] border-[#E5A962] shadow-inner font-black'
                    : 'bg-[#22252B] text-[#F3F0EA] border-[#343840] hover:border-[#E5A962] hover:text-[#E5A962]'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#101114]' : 'text-[#A4A8B1]'}`} />
                <span>{item.label}</span>
                <span className={`text-[9px] px-1 py-0.5 border ${
                  isActive ? 'border-[#101114]/40 bg-[#101114]/15 text-[#101114]' : 'border-[#343840] bg-[#14161B] text-[#A4A8B1]'
                }`}>
                  {item.shortcut}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Global Warning / Blackout Status Indicator */}
        <div className="flex items-center space-x-2">
          {blackoutActive && (
            <div className="px-3 py-1 bg-[#E56D6D] text-[#101114] font-black text-xs tracking-widest animate-pulse border border-red-300">
              ⚠️ BLACKOUT CUT ACTIVE
            </div>
          )}
          <div className="hidden lg:flex items-center space-x-1.5 px-2 py-1 bg-[#101114] border border-[#343840] text-[10px]">
            <span className="w-2 h-2 bg-[#52C98A] inline-block" />
            <span className="text-[#A4A8B1]">DMX LOCK:</span>
            <span className="text-[#52C98A] font-bold">1/48s 180° SYNC</span>
          </div>
        </div>
      </div>
    </header>
  );
};
