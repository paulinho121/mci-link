import React, { useEffect, useRef, useState } from 'react';
import { Fixture, LinkTransport } from '../types/cine';
import { getProfile } from '../data/fixtureProfiles';
import { DRIVERS, DiscoveredDevice, isWebBluetoothAvailable } from '../services/lightLink';
import { timo } from '../services/timo/timoLink';
import { SIDUS_DEFAULT_PORT, checkSecretKey, sidus } from '../services/sidus/client';
import {
  BleMeshConfig,
  bleMesh,
  checkMeshConfig,
  formatNodeLines,
  loadMeshSettings,
  parseMeshJson,
  parseNodeLines,
  saveMeshSettings,
} from '../services/ble/meshLink';
import { sound } from '../utils/soundEffects';
import { Bluetooth, Network, Radio, Wifi, X, Loader2, Check, ChevronLeft, RefreshCw, Link2, Monitor, Download, FileUp } from 'lucide-react';

interface PairingModalProps {
  fixtures: Fixture[];
  onClose: () => void;
  onPaired: (fixtures: Fixture[]) => void;
}

type Step = 'transport' | 'sidus-connect' | 'ble-connect' | 'timo-connect' | 'scan' | 'configure' | 'connecting';

/** Lights that come as a list from a controller (import all at once). */
const isListSource = (t: LinkTransport) => t === 'SIDUS' || t === 'BLE';

const TRANSPORT_ICONS: Record<LinkTransport, React.ElementType> = {
  SIDUS: Monitor,
  BLE: Bluetooth,
  TIMO: Bluetooth,
  ARTNET: Network,
  SACN: Wifi,
  CRMX: Radio,
};

const usesDmx = (t: LinkTransport) => t === 'ARTNET' || t === 'SACN' || t === 'CRMX';
/** DMX address without a universe: the light is its own Bluetooth "universe". */
const usesAddress = (t: LinkTransport) => usesDmx(t) || t === 'TIMO';

const SETTINGS_KEY = 'cinelight.amaranDesktop';

interface StoredSettings {
  host: string;
  port: number;
  secretKey?: string;
}

function loadSettings(): StoredSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { host: '127.0.0.1', port: SIDUS_DEFAULT_PORT, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return { host: '127.0.0.1', port: SIDUS_DEFAULT_PORT };
}

function saveSettings(s: StoredSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

/** Lowest start address in `universe` where `footprint` channels fit without overlap. */
export function nextFreeAddress(fixtures: Fixture[], universe: number, footprint: number): number {
  const used = fixtures
    .filter((f) => f.universe === universe)
    .map((f) => [f.startAddress, f.startAddress + f.channelCount - 1] as const);
  for (let a = 1; a + footprint - 1 <= 512; a++) {
    const end = a + footprint - 1;
    if (!used.some(([s, e]) => a <= e && end >= s)) return a;
  }
  return 1;
}

function tagPrefix(model: string): string {
  if (model.includes('Vortex')) return 'VTX';
  if (model.includes('Nova')) return 'NOVA';
  if (model.includes('MC')) return 'MC';
  if (model.includes('F22')) return 'MAT';
  if (model.includes('LS') || model.includes('200x')) return 'BI';
  if (model.includes('d Pro')) return 'DAY';
  if (model === 'Sidus Fixture') return 'AMA';
  return 'FIX';
}

function nextTag(fixtures: { tag: string }[], model: string): string {
  const prefix = tagPrefix(model);
  const n = fixtures.filter((f) => f.tag.startsWith(prefix + '-')).length + 1;
  return `${prefix}-${String(n).padStart(2, '0')}`;
}

function capabilityLine(d: DiscoveredDevice): string {
  const c = d.capabilities;
  if (c) {
    const color = c.hsi || c.rgb ? `${[c.hsi && 'HSI', c.rgb && 'RGB'].filter(Boolean).join('/')}` : 'WHITE ONLY';
    const fx = c.effects.length ? ` · ${c.effects.length} FX` : '';
    return `${c.cctMin === c.cctMax ? `${c.cctMin}K` : `${c.cctMin}–${c.cctMax}K`}${c.supportsTint ? ' · G/M' : ''} · ${color}${fx}`;
  }
  const p = getProfile(d.model);
  const kind = p.capability === 'FULL_COLOR' ? 'RGBWW' : p.capability === 'BICOLOR' ? 'BI-COLOR' : 'DAYLIGHT';
  return `${kind} · ${p.cctMin === p.cctMax ? `${p.cctMin}K` : `${p.cctMin}–${p.cctMax}K`}${d.battery !== undefined ? ` · BAT ${d.battery}%` : ''}`;
}

export function buildFixture(
  device: DiscoveredDevice,
  opts: { tag: string; group: number; universe: number; startAddress: number },
): Fixture {
  const profile = getProfile(device.model);
  const caps = device.capabilities;
  const cctMin = caps?.cctMin ?? profile.cctMin;
  const cctMax = caps?.cctMax ?? profile.cctMax;
  const dmx = usesDmx(device.transport);
  return {
    id: `fix-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: isListSource(device.transport) || device.transport === 'TIMO' ? device.deviceName : device.model,
    tag: opts.tag.trim().toUpperCase() || 'NEW-01',
    type: device.model,
    universe: dmx ? opts.universe : 0,
    startAddress: usesAddress(device.transport) ? opts.startAddress : 0,
    channelCount: profile.dmxMode.channels.length,
    power: true,
    dimmer: 50,
    cct: Math.min(cctMax, Math.max(cctMin, 5600)),
    tint: 0,
    colorMode: 'CCT',
    hue: 0,
    saturation: 0,
    x: 400 + Math.round(Math.random() * 200),
    y: 400 + Math.round(Math.random() * 200),
    rotation: 0,
    tilt: -30,
    beamAngle: 55,
    temperature: 34,
    rssi: device.rssi,
    battery: device.battery,
    group: opts.group,
    solo: false,
    muted: false,
    capabilities: caps,
    link: {
      transport: device.transport,
      status: 'connected',
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      nodeAddress: device.nodeAddress,
      crmxChannel: device.crmxChannel,
      firmware: device.firmware || undefined,
      pairedAt: Date.now(),
    },
  };
}

const inputCls = 'bg-[#101114] border border-[#343840] px-2 py-1.5 font-mono text-sm text-[#F3F0EA] focus:border-[#E5A962] outline-none';

export const PairingModal: React.FC<PairingModalProps> = ({ fixtures, onClose, onPaired }) => {
  const [step, setStep] = useState<Step>('transport');
  const [transport, setTransport] = useState<LinkTransport>('SIDUS');
  const [found, setFound] = useState<DiscoveredDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [device, setDevice] = useState<DiscoveredDevice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // amaran Desktop connection form
  const stored = useRef(loadSettings()).current;
  const [host, setHost] = useState(stored.host);
  const [port, setPort] = useState(stored.port);
  const [secretKey, setSecretKey] = useState(stored.secretKey ?? sidus.currentSettings?.secretKey ?? '');
  const [rememberKey, setRememberKey] = useState(!!stored.secretKey);
  const [connecting, setConnecting] = useState(false);

  // Bluetooth mesh form
  const storedMesh = useRef(loadMeshSettings()).current;
  const meshInit = bleMesh.currentConfig ?? storedMesh.config;
  const [netKey, setNetKey] = useState(meshInit.netKey ?? '');
  const [appKey, setAppKey] = useState(meshInit.appKey ?? '');
  const [ivIndex, setIvIndex] = useState(meshInit.ivIndex ?? 0);
  const [srcAddr, setSrcAddr] = useState((meshInit.src ?? 1).toString(16).toUpperCase().padStart(4, '0'));
  const [nodeText, setNodeText] = useState(formatNodeLines(meshInit.nodes ?? []));
  const [rememberMesh, setRememberMesh] = useState(storedMesh.rememberKeys);
  const meshFileRef = useRef<HTMLInputElement>(null);

  // Configure form
  const [tag, setTag] = useState('');
  const [group, setGroup] = useState(1);
  const [universe, setUniverse] = useState(1);
  const [startAddress, setStartAddress] = useState(1);

  const pairedIds = new Set(fixtures.map((f) => f.link?.deviceId).filter(Boolean));

  const foundRef = useRef<DiscoveredDevice[]>([]);
  foundRef.current = found;
  const keepRef = useRef(new Set<string>(fixtures.map((f) => f.link?.deviceId ?? '')));
  useEffect(
    () => () => {
      abortRef.current?.abort();
      for (const d of foundRef.current) if (d.transport === 'TIMO' && !keepRef.current.has(d.deviceId)) timo.disconnect(d.deviceId);
    },
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const startScan = async (t: LinkTransport) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setFound([]);
    setError(null);
    setScanning(true);
    try {
      await DRIVERS[t].discover((d) => {
        sound.tick();
        setFound((prev) => (prev.some((p) => p.deviceId === d.deviceId) ? prev : [...prev, d]));
      }, ctrl.signal);
    } catch (e) {
      const name = (e as DOMException).name;
      // AbortError = scan stopped, NotFoundError = Bluetooth picker cancelled
      if (name !== 'AbortError' && name !== 'NotFoundError') setError((e as Error).message ?? String(e));
    } finally {
      if (abortRef.current === ctrl) setScanning(false);
    }
  };

  const chooseTransport = (t: LinkTransport) => {
    sound.click();
    setTransport(t);
    setError(null);
    if (t === 'SIDUS' && sidus.status !== 'connected') {
      setStep('sidus-connect');
      return;
    }
    if (t === 'BLE' && bleMesh.status !== 'connected') {
      setStep('ble-connect');
      return;
    }
    if (t === 'TIMO') {
      setStep('timo-connect');
      return;
    }
    setStep('scan');
    startScan(t);
  };

  const connectSidus = async () => {
    sound.click();
    const keyError = checkSecretKey(secretKey);
    if (keyError) {
      setError(`API key: ${keyError}`);
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      await sidus.connect({ host: host.trim(), port, secretKey: secretKey.trim() });
      saveSettings({ host: host.trim(), port, ...(rememberKey ? { secretKey: secretKey.trim() } : {}) });
      setStep('scan');
      startScan('SIDUS');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConnecting(false);
    }
  };

  const loadMeshFile = async (file: File) => {
    setError(null);
    try {
      const c = parseMeshJson(await file.text());
      if (c.netKey) setNetKey(c.netKey);
      if (c.appKey) setAppKey(c.appKey);
      if (c.ivIndex !== undefined) setIvIndex(c.ivIndex);
      if (c.src) setSrcAddr(c.src.toString(16).toUpperCase().padStart(4, '0'));
      if (c.nodes?.length) setNodeText(formatNodeLines(c.nodes));
      if (!c.netKey || !c.appKey) setError('No NetKey / AppKey found in that file.');
    } catch (e) {
      setError(`Could not read the file: ${(e as Error).message}`);
    }
  };

  const connectBle = async () => {
    sound.click();
    const cfg: BleMeshConfig = {
      netKey: netKey.replace(/[^0-9a-f]/gi, ''),
      appKey: appKey.replace(/[^0-9a-f]/gi, ''),
      ivIndex: Math.max(0, Math.floor(ivIndex) || 0),
      src: parseInt(srcAddr, 16) || 0,
      nodes: parseNodeLines(nodeText),
    };
    const err = checkMeshConfig(cfg);
    if (err) {
      setError(err);
      return;
    }
    if (!cfg.nodes.length) {
      setError('Add at least one light: its mesh address and a name, one per line.');
      return;
    }
    setError(null);
    setConnecting(true);
    try {
      bleMesh.configure(cfg);
      saveMeshSettings(cfg, rememberMesh);
      // requestDevice must be the first await after the click.
      await bleMesh.connect();
      setStep('scan');
      startScan('BLE');
    } catch (e) {
      const ex = e as DOMException;
      if (ex.name !== 'NotFoundError') setError(ex.message ?? String(e)); // NotFound = chooser cancelled
    } finally {
      setConnecting(false);
    }
  };

  const chooseDevice = (d: DiscoveredDevice) => {
    sound.click();
    abortRef.current?.abort();
    setScanning(false);
    setDevice(d);
    const profile = getProfile(d.model);
    setTag(nextTag(fixtures, d.model));
    setGroup(1);
    const u = d.universe ?? 1;
    setUniverse(u);
    setStartAddress(d.startAddress ?? nextFreeAddress(fixtures, u, profile.dmxMode.channels.length));
    setStep('configure');
  };

  const confirmPair = async () => {
    if (!device) return;
    sound.click();
    setStep('connecting');
    setError(null);
    try {
      await DRIVERS[device.transport].connect(device);
    } catch (e) {
      setError(`Connection failed: ${(e as Error).message}`);
      setStep('configure');
      return;
    }
    keepRef.current.add(device.deviceId);
    onPaired([buildFixture(device, { tag, group, universe, startAddress })]);
  };

  const importAll = () => {
    sound.click();
    abortRef.current?.abort();
    const fresh = found.filter((d) => !pairedIds.has(d.deviceId));
    const made: Fixture[] = [];
    fresh.forEach((d) => {
      made.push(buildFixture(d, { tag: nextTag([...fixtures, ...made], d.model), group: 1, universe: 0, startAddress: 0 }));
    });
    if (made.length) onPaired(made);
  };

  const addressEnd = device ? startAddress + getProfile(device.model).dmxMode.channels.length - 1 : 0;
  const addressClash =
    device &&
    usesDmx(device.transport) &&
    fixtures.some(
      (f) => f.universe === universe && startAddress <= f.startAddress + f.channelCount - 1 && addressEnd >= f.startAddress,
    );
  const unpairedFound = found.filter((d) => !pairedIds.has(d.deviceId)).length;

  const goBack = () => {
    sound.click();
    abortRef.current?.abort();
    setScanning(false);
    setError(null);
    if (step === 'configure' && transport === 'TIMO') {
      setStep('timo-connect'); // the picker needs a tap, don't reopen it here
    } else if (step === 'configure') {
      setStep('scan');
      startScan(transport);
    } else {
      setStep('transport');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Pair a light"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-[#191B20] border border-[#E5A962] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#343840] bg-[#14161B]">
          <div className="flex items-center space-x-2">
            {step !== 'transport' && step !== 'connecting' && (
              <button onClick={goBack} className="p-1 text-[#A4A8B1] hover:text-[#E5A962]" aria-label="Back">
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <Link2 className="w-4 h-4 text-[#E5A962]" />
            <span className="font-mono font-black text-sm tracking-widest text-[#F3F0EA]">PAIR LIGHT</span>
            <span className="text-[10px] font-mono text-[#A4A8B1]">
              {step === 'transport' && '1/3 · CONNECTION'}
              {step === 'sidus-connect' && '1/3 · AMARAN DESKTOP'}
              {step === 'ble-connect' && '1/3 · BLUETOOTH MESH'}
              {step === 'timo-connect' && '1/3 · CRMX BLUETOOTH'}
              {step === 'scan' &&
                `2/3 · ${transport === 'SIDUS' ? 'FIXTURES IN AMARAN DESKTOP' : transport === 'BLE' ? 'LIGHTS IN THE MESH' : `SCAN ${DRIVERS[transport].label}`}`}
              {(step === 'configure' || step === 'connecting') && '3/3 · PATCH'}
            </span>
          </div>
          <button onClick={onClose} className="p-1 text-[#A4A8B1] hover:text-[#F3F0EA]" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Step 1: transport */}
          {step === 'transport' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(Object.keys(DRIVERS) as LinkTransport[]).map((t) => {
                const Icon = TRANSPORT_ICONS[t];
                const drv = DRIVERS[t];
                return (
                  <button
                    key={t}
                    onClick={() => chooseTransport(t)}
                    className={`text-left p-3 bg-[#22252B] border hover:border-[#E5A962] transition-colors flex flex-col space-y-2 ${
                      t === 'SIDUS' ? 'border-[#E5A962]/60 sm:col-span-2' : 'border-[#343840]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Icon className="w-4 h-4 text-[#E5A962]" />
                        <span className="font-mono font-black text-sm text-[#F3F0EA]">{drv.label}</span>
                      </div>
                      {drv.simulated ? (
                        <span className="text-[9px] font-mono px-1 border border-[#E6B45F]/50 text-[#E6B45F]">SIMULATED</span>
                      ) : (
                        <span className="text-[9px] font-mono px-1 border border-[#52C98A]/60 text-[#52C98A]">
                          {(t === 'SIDUS' && sidus.status === 'connected') || (t === 'BLE' && bleMesh.status === 'connected')
                            ? 'CONNECTED'
                            : t === 'BLE'
                              ? 'REVERSE ENGINEERED'
                              : t === 'TIMO'
                                ? 'OFFICIAL PROTOCOL'
                              : 'OFFICIAL API'}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-[#A4A8B1] leading-snug">{drv.description}</span>
                    {t === 'BLE' && (
                      <span className={`text-[10px] font-mono ${isWebBluetoothAvailable() ? 'text-[#52C98A]' : 'text-[#E56D6D]'}`}>
                        {isWebBluetoothAvailable()
                          ? 'Web Bluetooth available in this browser'
                          : 'Web Bluetooth not available here (use Chrome / Edge)'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Step 1b: amaran Desktop connection */}
          {step === 'sidus-connect' && (
            <div className="flex flex-col space-y-4">
              <div className="text-[11px] text-[#A4A8B1] leading-snug">
                Open <span className="text-[#F3F0EA]">amaran Desktop</span> on the PC where your lights are paired. Use
                <span className="font-mono text-[#F3F0EA]"> 127.0.0.1</span> if it runs on this computer, or that PC&apos;s IP
                address on the network.
              </div>
              <div className="grid grid-cols-3 gap-3">
                <label className="flex flex-col space-y-1 col-span-2">
                  <span className="text-[10px] font-mono text-[#A4A8B1] tracking-widest">HOST</span>
                  <input value={host} onChange={(e) => setHost(e.target.value)} className={inputCls} spellCheck={false} />
                </label>
                <label className="flex flex-col space-y-1">
                  <span className="text-[10px] font-mono text-[#A4A8B1] tracking-widest">PORT</span>
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value) || SIDUS_DEFAULT_PORT)}
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col space-y-1 col-span-3">
                  <span className="text-[10px] font-mono text-[#A4A8B1] tracking-widest">API SECRET KEY</span>
                  <input
                    type="password"
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    placeholder="Base64 key issued by Sidus for the amaran OpenAPI"
                    className={inputCls}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
              </div>
              <label className="flex items-center space-x-2 text-[11px] font-mono text-[#A4A8B1] cursor-pointer">
                <input type="checkbox" checked={rememberKey} onChange={(e) => setRememberKey(e.target.checked)} className="accent-[#E5A962]" />
                <span>Remember the key on this device</span>
              </label>
              {error && <div className="text-xs font-mono text-[#E56D6D]">{error}</div>}
            </div>
          )}

          {/* Step 1c: Bluetooth mesh keys */}
          {step === 'ble-connect' && (
            <div className="flex flex-col space-y-4">
              <div className="text-[11px] text-[#A4A8B1] leading-snug">
                Your amaran / Aputure lights share one Bluetooth <span className="text-[#F3F0EA]">mesh</span>. This device
                connects to the nearest light and it relays to all the others. You need the mesh keys from your Sidus
                account: run <span className="font-mono text-[#F3F0EA]">npm run ble:export-mesh</span> on the PC with
                amaran Desktop and load the file here. Close amaran Desktop and Sidus Link first: a light accepts one
                Bluetooth controller at a time.
              </div>
              {!isWebBluetoothAvailable() && (
                <div className="text-xs font-mono text-[#E56D6D]">
                  {/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
                    ? 'iPhone / iPad: Safari and Chrome have no Bluetooth for web pages. Open this page in the free "Bluefy" browser from the App Store.'
                    : 'Web Bluetooth is not available in this browser. Use Chrome or Edge on Android, Windows or Mac.'}
                </div>
              )}
              <div>
                <input
                  ref={meshFileRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) loadMeshFile(f);
                    e.target.value = '';
                  }}
                />
                <button
                  onClick={() => meshFileRef.current?.click()}
                  className="flex items-center space-x-2 px-3 py-1.5 border border-[#343840] text-[#F3F0EA] text-xs font-mono hover:border-[#E5A962]"
                >
                  <FileUp className="w-3.5 h-3.5" />
                  <span>LOAD MESH FILE (.json)</span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col space-y-1 col-span-2 sm:col-span-1">
                  <span className="text-[10px] font-mono text-[#A4A8B1] tracking-widest">NETKEY</span>
                  <input type="password" value={netKey} onChange={(e) => setNetKey(e.target.value)} placeholder="32 hex characters" className={inputCls} autoComplete="off" spellCheck={false} />
                </label>
                <label className="flex flex-col space-y-1 col-span-2 sm:col-span-1">
                  <span className="text-[10px] font-mono text-[#A4A8B1] tracking-widest">APPKEY</span>
                  <input type="password" value={appKey} onChange={(e) => setAppKey(e.target.value)} placeholder="32 hex characters" className={inputCls} autoComplete="off" spellCheck={false} />
                </label>
                <label className="flex flex-col space-y-1">
                  <span className="text-[10px] font-mono text-[#A4A8B1] tracking-widest">IV INDEX</span>
                  <input type="number" min={0} value={ivIndex} onChange={(e) => setIvIndex(Number(e.target.value) || 0)} className={inputCls} />
                </label>
                <label className="flex flex-col space-y-1">
                  <span className="text-[10px] font-mono text-[#A4A8B1] tracking-widest">THIS DEVICE ADDRESS (HEX)</span>
                  <input value={srcAddr} onChange={(e) => setSrcAddr(e.target.value.replace(/[^0-9a-f]/gi, '').slice(0, 4))} className={`${inputCls} uppercase`} spellCheck={false} />
                </label>
                <label className="flex flex-col space-y-1 col-span-2">
                  <span className="text-[10px] font-mono text-[#A4A8B1] tracking-widest">LIGHTS · ONE PER LINE: MESH ADDRESS + NAME</span>
                  <textarea
                    value={nodeText}
                    onChange={(e) => setNodeText(e.target.value)}
                    rows={4}
                    placeholder={'2 Key Light\n4 Back Light\n6 Tube'}
                    className={`${inputCls} resize-y`}
                    spellCheck={false}
                  />
                </label>
              </div>
              <label className="flex items-center space-x-2 text-[11px] font-mono text-[#A4A8B1] cursor-pointer">
                <input type="checkbox" checked={rememberMesh} onChange={(e) => setRememberMesh(e.target.checked)} className="accent-[#E5A962]" />
                <span>Remember the keys on this device</span>
              </label>
              {error && <div className="text-xs font-mono text-[#E56D6D]">{error}</div>}
            </div>
          )}

          {/* Step 1d: CRMX Bluetooth (LumenRadio TimoTwo, e.g. Creamsource Vortex) */}
          {step === 'timo-connect' && (
            <div className="flex flex-col space-y-4">
              <div className="text-[11px] text-[#A4A8B1] leading-snug">
                For <span className="text-[#F3F0EA]">Creamsource Vortex</span> and other lights with LumenRadio CRMX
                Bluetooth. Each light has its own Bluetooth link. Set this on the light first:
              </div>
              <ol className="text-[11px] font-mono text-[#F3F0EA] space-y-1.5 list-decimal pl-5">
                <li>LINK → CRMX Settings → turn on <span className="text-[#E5A962]">CRMX</span> and <span className="text-[#E5A962]">CRMX BLE</span>.</li>
                <li>LINK → DMX Settings → DMX Mode <span className="text-[#E5A962]">8</span> (16-bit CCT &amp; Hue/Sat).</li>
                <li>LINK → DMX Settings → DMX Address <span className="text-[#E5A962]">1</span> (or note the one you use).</li>
                <li>Optional: DMX Smoothing → Smooth, to hide Bluetooth steps.</li>
              </ol>
              <div className="text-[11px] text-[#A4A8B1] leading-snug">
                Close Luminair, Slyyd and CRMX Toolbox on other devices: the light takes one Bluetooth app at a time. If it
                asks for a PIN, remove it on the light (LINK → CRMX Settings → Remove CRMX BLE Pin).
              </div>
              {!isWebBluetoothAvailable() && (
                <div className="text-xs font-mono text-[#E56D6D]">
                  Bluetooth is not available in this browser. Use the Cine Light OS app, Chrome / Edge, or Bluefy on iPhone.
                </div>
              )}
              {error && <div className="text-xs font-mono text-[#E56D6D]">{error}</div>}
            </div>
          )}

          {/* Step 2: scan */}
          {step === 'scan' && (
            <div className="flex flex-col space-y-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#A4A8B1] flex items-center space-x-2">
                  {scanning ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E5A962]" />
                      <span>{transport === 'SIDUS' ? 'READING FIXTURES FROM AMARAN DESKTOP…' : transport === 'BLE' ? 'READING THE MESH…' : transport === 'TIMO' ? 'CHOOSE THE LIGHT IN THE BLUETOOTH WINDOW…' : `SEARCHING FOR ${DRIVERS[transport].label} DEVICES…`}</span>
                    </>
                  ) : (
                    <span>{found.length} DEVICE(S) FOUND</span>
                  )}
                </span>
                <div className="flex items-center space-x-2">
                  {isListSource(transport) && !scanning && unpairedFound > 1 && (
                    <button
                      onClick={importAll}
                      className="flex items-center space-x-1 px-2 py-1 bg-[#E5A962] text-[#101114] font-black border border-[#E5A962]"
                    >
                      <Download className="w-3 h-3" />
                      <span>IMPORT ALL ({unpairedFound})</span>
                    </button>
                  )}
                  {!scanning && (
                    <button
                      onClick={() => { sound.click(); startScan(transport); }}
                      className="flex items-center space-x-1 px-2 py-1 border border-[#343840] text-[#F3F0EA] hover:border-[#E5A962]"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>{isListSource(transport) ? 'RELOAD' : transport === 'TIMO' ? 'ADD ANOTHER LIGHT' : 'RESCAN'}</span>
                    </button>
                  )}
                </div>
              </div>

              {error && <div className="text-xs font-mono text-[#E56D6D]">{error}</div>}

              <div className="flex flex-col space-y-1.5">
                {found.map((d) => {
                  const already = pairedIds.has(d.deviceId);
                  return (
                    <button
                      key={d.deviceId}
                      disabled={already}
                      onClick={() => chooseDevice(d)}
                      className={`flex items-center justify-between p-2.5 border text-left transition-colors ${
                        already
                          ? 'bg-[#14161B] border-[#343840] opacity-50 cursor-not-allowed'
                          : 'bg-[#22252B] border-[#343840] hover:border-[#E5A962]'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-heading font-semibold text-[#F3F0EA]">
                          {isListSource(d.transport) || d.transport === 'TIMO' ? d.deviceName : d.model}
                        </span>
                        <span className="text-[10px] font-mono text-[#A4A8B1]">
                          {d.transport === 'SIDUS'
                            ? `${d.model === 'Sidus Fixture' ? 'MODEL NOT RECOGNISED' : d.model} · NODE ${d.deviceId}`
                            : d.transport === 'BLE'
                              ? `${d.model === 'Sidus Fixture' ? 'MODEL NOT RECOGNISED' : d.model} · ADDR ${d.nodeAddress} · VIA ${bleMesh.proxyName || 'BLUETOOTH'}`
                              : d.transport === 'TIMO'
                                ? `${d.model} · READY · DMX MODE 8`
                                : `${d.deviceName} · FW ${d.firmware}`}
                          {!isListSource(d.transport) && d.nodeAddress && ` · NODE ${d.nodeAddress}`}
                          {d.crmxChannel !== undefined && ` · CRMX CH-${d.crmxChannel}`}
                          {d.universe !== undefined && ` · U${d.universe}:${d.startAddress}`}
                        </span>
                        <span className="text-[10px] font-mono text-[#A4A8B1]">{capabilityLine(d)}</span>
                      </div>
                      <div className="flex flex-col items-end space-y-1">
                        {!isListSource(d.transport) && d.transport !== 'TIMO' && <span className="text-[10px] font-mono text-[#52C98A]">{d.rssi} dBm</span>}
                        {already ? (
                          <span className="text-[10px] font-mono text-[#A4A8B1]">PAIRED</span>
                        ) : (
                          <span className="text-[10px] font-mono font-bold text-[#E5A962]">SELECT →</span>
                        )}
                      </div>
                    </button>
                  );
                })}
                {!scanning && found.length === 0 && !error && (
                  <div className="text-xs font-mono text-[#A4A8B1] p-4 text-center border border-dashed border-[#343840]">
                    {transport === 'SIDUS'
                      ? 'amaran Desktop has no fixtures yet. Pair your lights in amaran Desktop first.'
                      : transport === 'BLE'
                        ? 'No lights in the list. Go back and add their mesh addresses.'
                        : transport === 'TIMO'
                          ? 'No light chosen. Tap ADD ANOTHER LIGHT to open the Bluetooth window again.'
                        : 'No devices found. Check that the light is on and in range.'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: configure / connecting */}
          {(step === 'configure' || step === 'connecting') && device && (
            <div className="flex flex-col space-y-4">
              <div className="p-3 bg-[#22252B] border border-[#343840]">
                <div className="text-sm font-heading font-semibold text-[#F3F0EA]">
                  {isListSource(device.transport) || device.transport === 'TIMO' ? device.deviceName : device.model}
                </div>
                <div className="text-[10px] font-mono text-[#A4A8B1]">
                  {DRIVERS[device.transport].label} ·{' '}
                  {device.transport === 'SIDUS'
                    ? `via ${device.nodeAddress}`
                    : device.transport === 'BLE'
                      ? `mesh address ${device.nodeAddress} · via ${bleMesh.proxyName || 'Bluetooth'}`
                      : device.transport === 'TIMO'
                        ? `${device.model} · direct Bluetooth`
                        : `${device.deviceName} · ${device.rssi} dBm`}
                </div>
                <div className="text-[10px] font-mono text-[#A4A8B1]">{capabilityLine(device)}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col space-y-1">
                  <span className="text-[10px] font-mono text-[#A4A8B1] tracking-widest">TAG</span>
                  <input value={tag} onChange={(e) => setTag(e.target.value)} maxLength={10} className={`${inputCls} uppercase`} />
                </label>
                <label className="flex flex-col space-y-1">
                  <span className="text-[10px] font-mono text-[#A4A8B1] tracking-widest">GROUP</span>
                  <select value={group} onChange={(e) => setGroup(Number(e.target.value))} className={inputCls}>
                    {[1, 2, 3].map((g) => (
                      <option key={g} value={g}>GRP {g}</option>
                    ))}
                  </select>
                </label>

                {device.transport === 'TIMO' && (
                  <label className="flex flex-col space-y-1 col-span-2">
                    <span className="text-[10px] font-mono text-[#A4A8B1] tracking-widest">
                      DMX ADDRESS ON THE LIGHT ({getProfile(device.model).dmxMode.channels.length} CH)
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={512 - getProfile(device.model).dmxMode.channels.length + 1}
                      value={startAddress}
                      onChange={(e) => setStartAddress(Math.max(1, Math.min(512, Number(e.target.value) || 1)))}
                      className={inputCls}
                    />
                  </label>
                )}

                {usesDmx(device.transport) && (
                  <>
                    <label className="flex flex-col space-y-1">
                      <span className="text-[10px] font-mono text-[#A4A8B1] tracking-widest">UNIVERSE</span>
                      <select
                        value={universe}
                        onChange={(e) => {
                          const u = Number(e.target.value);
                          setUniverse(u);
                          setStartAddress(nextFreeAddress(fixtures, u, getProfile(device.model).dmxMode.channels.length));
                        }}
                        className={inputCls}
                      >
                        {[1, 2, 3, 4].map((u) => (
                          <option key={u} value={u}>U{u}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col space-y-1">
                      <span className="text-[10px] font-mono text-[#A4A8B1] tracking-widest">
                        START ADDRESS ({getProfile(device.model).dmxMode.channels.length} CH)
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={512}
                        value={startAddress}
                        onChange={(e) => setStartAddress(Math.max(1, Math.min(512, Number(e.target.value) || 1)))}
                        className={`${inputCls} ${addressClash ? '!border-[#E56D6D]' : ''}`}
                      />
                    </label>
                  </>
                )}
              </div>

              {usesDmx(device.transport) && (
                <div className={`text-[10px] font-mono ${addressClash || addressEnd > 512 ? 'text-[#E56D6D]' : 'text-[#A4A8B1]'}`}>
                  {addressClash
                    ? `Address overlap in U${universe} (CH ${startAddress}–${addressEnd}). Choose another start address.`
                    : addressEnd > 512
                      ? `Footprint runs past channel 512.`
                      : `Mode "${getProfile(device.model).dmxMode.name}" · U${universe} CH ${startAddress}–${addressEnd}`}
                </div>
              )}

              {device.transport === 'TIMO' && (
                <div className="text-[10px] font-mono text-[#A4A8B1]">
                  {`The light must be in "${getProfile(device.model).dmxMode.name}" at address ${startAddress} (CH ${startAddress}–${addressEnd}).`}
                </div>
              )}

              {error && <div className="text-xs font-mono text-[#E56D6D]">{error}</div>}
            </div>
          )}
        </div>

        {step === 'sidus-connect' && (
          <div className="px-4 py-3 border-t border-[#343840] bg-[#14161B] flex justify-end">
            <button
              onClick={connectSidus}
              disabled={connecting || !host.trim() || !secretKey.trim()}
              className="flex items-center space-x-2 px-4 py-2 bg-[#E5A962] text-[#101114] font-mono font-black text-xs tracking-widest disabled:opacity-50"
            >
              {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              <span>{connecting ? 'CONNECTING…' : 'CONNECT'}</span>
            </button>
          </div>
        )}

        {step === 'timo-connect' && (
          <div className="px-4 py-3 border-t border-[#343840] bg-[#14161B] flex justify-end">
            <button
              onClick={() => {
                sound.click();
                setStep('scan');
                startScan('TIMO'); // opens the Bluetooth picker inside this tap
              }}
              disabled={!isWebBluetoothAvailable()}
              className="flex items-center space-x-2 px-4 py-2 bg-[#E5A962] text-[#101114] font-mono font-black text-xs tracking-widest disabled:opacity-50"
            >
              <Bluetooth className="w-3.5 h-3.5" />
              <span>SEARCH FOR THE LIGHT</span>
            </button>
          </div>
        )}

        {step === 'ble-connect' && (
          <div className="px-4 py-3 border-t border-[#343840] bg-[#14161B] flex justify-end">
            <button
              onClick={connectBle}
              disabled={connecting || !isWebBluetoothAvailable() || !netKey.trim() || !appKey.trim()}
              className="flex items-center space-x-2 px-4 py-2 bg-[#E5A962] text-[#101114] font-mono font-black text-xs tracking-widest disabled:opacity-50"
            >
              {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bluetooth className="w-3.5 h-3.5" />}
              <span>{connecting ? 'CONNECTING…' : 'CONNECT VIA BLUETOOTH'}</span>
            </button>
          </div>
        )}

        {(step === 'configure' || step === 'connecting') && (
          <div className="px-4 py-3 border-t border-[#343840] bg-[#14161B] flex justify-end">
            <button
              onClick={confirmPair}
              disabled={step === 'connecting' || !!addressClash || (!!device && usesDmx(device.transport) && addressEnd > 512)}
              className="flex items-center space-x-2 px-4 py-2 bg-[#E5A962] text-[#101114] font-mono font-black text-xs tracking-widest disabled:opacity-50"
            >
              {step === 'connecting' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>CONNECTING…</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>PAIR & CONTROL</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
