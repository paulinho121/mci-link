/**
 * Bluetooth LE backends for the mesh proxy link.
 *  - native: the Capacitor app on iPhone / iPad / Android
 *            (@capacitor-community/bluetooth-le, CoreBluetooth / Android BLE).
 *  - web:    Web Bluetooth in Chrome / Edge (https or localhost).
 * Both expose the same tiny surface: pick a light, open the proxy link,
 * write proxy PDUs, receive notifications.
 */
import { Capacitor } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';

export const MESH_PROXY_SERVICE = '00001828-0000-1000-8000-00805f9b34fb';
export const MESH_PROVISIONING_SERVICE = '00001827-0000-1000-8000-00805f9b34fb';
/** Extra services we ask access to, only to report what a light exposes. */
const DIAG_SERVICES = [
  '0000180a-0000-1000-8000-00805f9b34fb', // Device Information
  '00010203-0405-0607-0809-0a0b0c0d1910', // Telink proprietary mesh (older Sidus)
  '00010203-0405-0607-0809-0a0b0c0d1912', // Telink OTA
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
];
const ALL_OPTIONAL = [MESH_PROXY_SERVICE, MESH_PROVISIONING_SERVICE, ...DIAG_SERVICES];
const PROXY_DATA_IN = '00002add-0000-1000-8000-00805f9b34fb';
const PROXY_DATA_OUT = '00002ade-0000-1000-8000-00805f9b34fb';

const NAME_PREFIXES = ['amaran', 'Amaran', 'AMARAN', 'Aputure', 'APUTURE', 'SLCK'];

export const NOT_IN_MESH =
  'The light only shows its "new light" (provisioning) service, not the mesh one. If it is not in Sidus Link yet, add it there and reload the mesh keys. If it already is, Windows may be showing old cached services: remove the light in Windows Settings → Bluetooth & devices, then connect again.';
export const NO_PROXY = 'This device has no Bluetooth Mesh proxy service.';

export interface ProxyLink {
  write(data: Uint8Array): Promise<void>;
  /** Largest write in bytes, when the platform reports it (MTU − 3). */
  maxWrite: number | null;
}

export interface BleHandle {
  id: string;
  name: string;
  open(onNotify: (data: Uint8Array) => void, onDisconnect: () => void): Promise<ProxyLink>;
  close(): void;
}

export interface BleBackend {
  kind: 'native' | 'web';
  /**
   * Shows the system / browser picker. Call straight from a tap.
   * `showAll` lists every Bluetooth device (no filter), for lights that
   * advertise under an unexpected name.
   */
  choose(showAll?: boolean): Promise<BleHandle>;
}

export const isNativeApp = () => Capacitor.isNativePlatform();

// ---------------------------------------------------------------------------
// Native (Capacitor)

let nativeReady: Promise<void> | null = null;
const initNative = () => (nativeReady ??= BleClient.initialize({ androidNeverForLocation: true }));

const nativeBackend: BleBackend = {
  kind: 'native',
  async choose(showAll) {
    await initNative();
    const device = await BleClient.requestDevice({
      ...(showAll ? {} : { services: [MESH_PROXY_SERVICE, MESH_PROVISIONING_SERVICE] }),
      optionalServices: [MESH_PROXY_SERVICE, MESH_PROVISIONING_SERVICE],
    });
    const id = device.deviceId;
    return {
      id,
      name: device.name ?? 'Bluetooth light',
      async open(onNotify, onDisconnect) {
        await initNative();
        await BleClient.connect(id, () => onDisconnect());
        const services = await BleClient.getServices(id);
        const has = (uuid: string) => services.some((s) => s.uuid.toLowerCase() === uuid);
        if (!has(MESH_PROXY_SERVICE)) {
          await BleClient.disconnect(id).catch(() => undefined);
          throw new Error(has(MESH_PROVISIONING_SERVICE) ? NOT_IN_MESH : NO_PROXY);
        }
        await BleClient.startNotifications(id, MESH_PROXY_SERVICE, PROXY_DATA_OUT, (v) =>
          onNotify(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)),
        );
        const mtu = await BleClient.getMtu(id).catch(() => 23);
        return {
          maxWrite: Math.max(20, mtu - 3),
          write: (d) =>
            BleClient.writeWithoutResponse(id, MESH_PROXY_SERVICE, PROXY_DATA_IN, new DataView(d.buffer, d.byteOffset, d.byteLength)),
        };
      },
      close() {
        BleClient.disconnect(id).catch(() => undefined);
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Web Bluetooth (minimal typings: not in TS's DOM lib)

interface BtCharacteristic extends EventTarget {
  value?: DataView;
  startNotifications(): Promise<BtCharacteristic>;
  writeValueWithoutResponse(data: Uint8Array): Promise<void>;
}
interface BtService {
  getCharacteristic(uuid: string): Promise<BtCharacteristic>;
}
interface BtServer {
  connected: boolean;
  connect(): Promise<BtServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BtService>;
  getPrimaryServices(): Promise<{ uuid: string }[]>;
}
interface BtDevice extends EventTarget {
  id: string;
  name?: string;
  gatt?: BtServer;
}
interface Bt {
  requestDevice(opts: unknown): Promise<BtDevice>;
}
const webBluetooth = (): Bt | null =>
  typeof navigator !== 'undefined' && 'bluetooth' in navigator ? (navigator as unknown as { bluetooth: Bt }).bluetooth : null;

const webBackend: BleBackend = {
  kind: 'web',
  async choose(showAll) {
    const bt = webBluetooth();
    if (!bt) throw new Error('Web Bluetooth is not available in this browser.');
    const device = await bt.requestDevice(
      showAll
        ? { acceptAllDevices: true, optionalServices: ALL_OPTIONAL }
        : {
            filters: [{ services: [MESH_PROXY_SERVICE] }, ...NAME_PREFIXES.map((namePrefix) => ({ namePrefix }))],
            optionalServices: ALL_OPTIONAL,
          },
    );
    let disconnectHandler: (() => void) | null = null;
    device.addEventListener('gattserverdisconnected', () => disconnectHandler?.());
    return {
      id: device.id,
      name: device.name ?? 'Bluetooth light',
      async open(onNotify, onDisconnect) {
        const gatt = device.gatt;
        if (!gatt) throw new Error(NO_PROXY);
        disconnectHandler = onDisconnect;
        const server = await gatt.connect();
        const found = await server.getPrimaryServices().then(
          (list) => list.map((x) => x.uuid),
          () => [] as string[],
        );
        console.info('[mesh] services on', device.name ?? device.id, found);
        let service: BtService | null = null;
        // Some lights switch their GATT table just after connecting: ask again.
        for (let attempt = 0; attempt < 3 && !service; attempt++) {
          if (attempt) await new Promise((r) => setTimeout(r, 700));
          service = await server.getPrimaryService(MESH_PROXY_SERVICE).catch(() => null);
        }
        if (!service) {
          const factory = found.includes(MESH_PROVISIONING_SERVICE);
          disconnectHandler = null;
          server.disconnect();
          throw new Error(factory ? NOT_IN_MESH : NO_PROXY);
        }
        const dataIn = await service.getCharacteristic(PROXY_DATA_IN);
        const dataOut = await service.getCharacteristic(PROXY_DATA_OUT);
        dataOut.addEventListener('characteristicvaluechanged', (e) => {
          const v = (e.target as BtCharacteristic).value;
          if (v) onNotify(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
        });
        await dataOut.startNotifications();
        // Chrome negotiates the MTU but does not report it: try full writes
        // and fall back to segments if one is refused.
        return { maxWrite: null, write: (d) => dataIn.writeValueWithoutResponse(d) };
      },
      close() {
        device.gatt?.disconnect();
      },
    };
  },
};

export const bleAvailable = () => isNativeApp() || webBluetooth() !== null;
export const bleBackend = (): BleBackend => (isNativeApp() ? nativeBackend : webBackend);
