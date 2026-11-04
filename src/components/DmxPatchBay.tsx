import React, { useState } from 'react';
import { Fixture } from '../types/cine';
import { sound } from '../utils/soundEffects';
import { RefreshCw, CheckCircle, Wifi, Cpu, Database } from 'lucide-react';

interface DmxPatchBayProps {
  fixtures: Fixture[];
  onUpdateFixture: (id: string, updates: Partial<Fixture>) => void;
  blackoutActive: boolean;
}

export const DmxPatchBay: React.FC<DmxPatchBayProps> = ({
  fixtures,
  onUpdateFixture,
  blackoutActive,
}) => {
  const [selectedUniverse, setSelectedUniverse] = useState<number>(1);
  const [isDiscoveringRdm, setIsDiscoveringRdm] = useState(false);

  const universeFixtures = fixtures.filter(f => f.universe === selectedUniverse);

  // Compute 512 channels map
  const channels = Array.from({ length: 512 }, (_, i) => {
    const address = i + 1;
    // Check if any fixture occupies this address
    const fixture = universeFixtures.find(
      f => address >= f.startAddress && address < f.startAddress + f.channelCount
    );

    let level = 0;
    if (fixture && fixture.power && !fixture.muted && !blackoutActive) {
      // First channel is usually dimmer (0-255)
      if (address === fixture.startAddress) {
        level = Math.round((fixture.dimmer / 100) * 255);
      } else {
        // CCT / Tint / Color channel simulation
        level = Math.round((Math.sin(address) * 0.5 + 0.5) * 255);
      }
    }

    return {
      address,
      fixture,
      isStart: fixture ? address === fixture.startAddress : false,
      level,
    };
  });

  const handleRdmDiscovery = () => {
    sound.tick();
    setIsDiscoveringRdm(true);
    setTimeout(() => {
      sound.click();
      setIsDiscoveringRdm(false);
    }, 1200);
  };

  return (
    <div className="flex flex-col h-full bg-[#101114] p-3 overflow-hidden select-none space-y-3">
      {/* Universe Selector & RDM Discover Header */}
      <div className="bg-[#191B20] p-2.5 border border-[#343840] flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <span className="text-[10px] font-mono text-[#A4A8B1] uppercase font-bold tracking-widest">
            DMX UNIVERSE:
          </span>
          {[1, 2, 3, 4].map((u) => {
            const count = fixtures.filter(f => f.universe === u).length;
            return (
              <button
                key={u}
                onClick={() => { sound.click(); setSelectedUniverse(u); }}
                className={`px-3 py-1 font-mono text-xs font-bold border transition-colors ${
                  selectedUniverse === u
                    ? 'bg-[#E5A962] text-[#101114] border-[#E5A962]'
                    : 'bg-[#22252B] text-[#F3F0EA] border-[#343840] hover:border-[#E5A962]'
                }`}
              >
                UNIVERSE {u} ({count} FIXTURES)
              </button>
            );
          })}
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleRdmDiscovery}
            disabled={isDiscoveringRdm}
            className={`px-3 py-1 bg-[#22252B] border border-[#343840] hover:border-[#52C98A] text-xs font-mono font-bold flex items-center space-x-1.5 ${
              isDiscoveringRdm ? 'text-[#E5A962]' : 'text-[#52C98A]'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isDiscoveringRdm ? 'animate-spin' : ''}`} />
            <span>{isDiscoveringRdm ? 'POLLING RDM BUS...' : 'RUN RDM DISCOVERY'}</span>
          </button>
        </div>
      </div>

      {/* Main Body: 512 Channel Matrix & Patch Details */}
      <div className="flex-1 flex flex-col lg:flex-row gap-3 overflow-hidden">
        {/* 512 Slots Interactive Grid */}
        <div className="flex-1 bg-[#14161B] border border-[#343840] p-3 flex flex-col overflow-hidden">
          <div className="flex justify-between items-center text-[10px] font-mono text-[#A4A8B1] mb-2">
            <span>512-CHANNEL DMX ALLOCATION TABLE (UNIVERSE {selectedUniverse}):</span>
            <div className="flex items-center space-x-3">
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 bg-[#E5A962] inline-block" />
                <span>ACTIVE DMX LEVEL</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 bg-[#2B2F38] border border-[#343840] inline-block" />
                <span>PATCHED</span>
              </span>
            </div>
          </div>

          {/* 512 Grid Cells */}
          <div className="flex-1 overflow-y-auto grid grid-cols-8 sm:grid-cols-16 md:grid-cols-24 lg:grid-cols-32 gap-1 p-1 bg-[#101114] border border-[#343840]">
            {channels.map((ch) => {
              const hasFixture = !!ch.fixture;
              return (
                <div
                  key={ch.address}
                  title={
                    ch.fixture
                      ? `${ch.fixture.tag} (${ch.fixture.name})\nAddress: ${ch.address}\nLevel: ${ch.level}/255`
                      : `Address: ${ch.address} (Unpatched)`
                  }
                  className={`h-7 border flex flex-col justify-between p-0.5 text-[8px] font-mono transition-colors ${
                    hasFixture
                      ? ch.level > 0
                        ? 'bg-[#2B2F38] border-[#E5A962]'
                        : 'bg-[#1F1F23] border-[#343840]'
                      : 'bg-[#121316] border-[#1F1F23] opacity-40'
                  }`}
                >
                  <div className="flex justify-between items-center text-[7px] text-[#A4A8B1]">
                    <span>{ch.address}</span>
                    {ch.isStart && <span className="text-[#E5A962] font-black">★</span>}
                  </div>
                  <div className={`font-mono text-center font-bold ${ch.level > 0 ? 'text-[#E5A962]' : 'text-[#A4A8B1]'}`}>
                    {hasFixture ? ch.level : '-'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Inspector: Patched Fixtures RDM List */}
        <div className="w-full lg:w-96 bg-[#191B20] border border-[#343840] p-3 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-3">
            <div className="border-b border-[#343840] pb-2 text-[10px] font-mono text-[#E5A962] font-bold tracking-widest uppercase">
              PATCHED FIXTURES (UNIVERSE {selectedUniverse}):
            </div>

            <div className="space-y-2">
              {universeFixtures.length === 0 ? (
                <div className="p-4 text-center text-xs font-mono text-[#A4A8B1] bg-[#14161B] border border-[#343840]">
                  No fixtures patched on Universe {selectedUniverse}.
                </div>
              ) : (
                universeFixtures.map((f) => (
                  <div
                    key={f.id}
                    className="p-2.5 bg-[#22252B] border border-[#343840] space-y-1 font-mono text-xs"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-black text-[#E5A962]">{f.tag}</span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-[#14161B] border border-[#343840] text-[#52C98A]">
                        CH {f.startAddress} - {f.startAddress + f.channelCount - 1} ({f.channelCount}CH)
                      </span>
                    </div>

                    <div className="font-heading font-bold text-xs text-[#F3F0EA]">
                      {f.name}
                    </div>

                    <div className="flex justify-between text-[10px] text-[#A4A8B1] pt-1 border-t border-[#343840]">
                      <span>RDM: ARRI-S60-{f.id.toUpperCase()}</span>
                      <span>TEMP: {f.temperature}°C</span>
                    </div>

                    <div className="flex items-center space-x-2 pt-1 text-[10px]">
                      <span className="text-[#A4A8B1]">DMX ADDR:</span>
                      <input
                        type="number"
                        min={1}
                        max={512 - f.channelCount + 1}
                        value={f.startAddress}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(512, Number(e.target.value)));
                          onUpdateFixture(f.id, { startAddress: val });
                        }}
                        className="w-16 bg-[#101114] border border-[#343840] px-1.5 py-0.5 text-[#F3F0EA] font-mono outline-none"
                      />
                      <span className="text-[#A4A8B1]">UNIVERSE:</span>
                      <select
                        value={f.universe}
                        onChange={(e) => onUpdateFixture(f.id, { universe: Number(e.target.value) })}
                        aria-label="Universe assignment"
                        className="bg-[#101114] border border-[#343840] px-1.5 py-0.5 text-[#F3F0EA] font-mono outline-none"
                      >
                        {[1, 2, 3, 4].map(u => (
                          <option key={u} value={u}>U{u}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* RDM Diagnostics Footer */}
          <div className="pt-3 border-t border-[#343840] space-y-1 font-mono text-[10px] text-[#A4A8B1]">
            <div className="flex justify-between">
              <span>CRMX TIMOTWO FIRMWARE:</span>
              <span className="text-[#52C98A]">v3.1.8-RELEASE</span>
            </div>
            <div className="flex justify-between">
              <span>ART-NET 4 UDP SOCKET:</span>
              <span className="text-[#F3F0EA]">PORT 6454 / BROADCAST</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
