# Direct Bluetooth (no amaran Desktop)

Cine Light OS can control amaran / Aputure lights straight from a tablet,
phone or laptop over Bluetooth. This is **reverse engineered**, based on
[wesbos/amaran-BLE-control](https://github.com/wesbos/amaran-BLE-control). A
light firmware update can break it.

## How it works

The lights form one Bluetooth Mesh network, created by Sidus Link / amaran
Desktop. The app connects to the nearest light (Mesh Proxy service `0x1828`)
and that light relays every command to the others. Commands are a 10-byte
Telink payload sent with vendor opcode `0x26`, encrypted with the mesh NetKey
and AppKey.

| Console | Telink command |
|---|---|
| Power off / blackout / level 0 | on/off `0x8C` |
| Dimmer + CCT + tint | CCT `0x82` (intensity 0–1000, 10 K steps, G/M −10…+10) |
| HSI, colour XY, gel | HSI `0x81` (XY and gels are converted to hue/sat) |
| FX | run by the console (dimmer changes), not by the light |

## Requirements

- Chrome or Edge on Android, Windows or Mac, on `https` or `localhost`.
  **iPhone and iPad are not supported** (no Web Bluetooth in Safari).
- The lights must already be in your Sidus mesh (added once with Sidus Link or
  amaran Desktop). A light in factory state shows the error "not in a mesh
  yet".
- Close amaran Desktop and Sidus Link while using Bluetooth: a light accepts
  one Bluetooth controller at a time.

## Getting the mesh keys

On the PC where amaran Desktop is installed and logged in:

```bash
npm run ble:export-mesh
```

This reads `amaran.db` (in `%APPDATA%\amaran Desktop\<account>\` on Windows)
and writes `amaran-mesh.local.json`, which is git-ignored. It prints only
counts and light names, never the keys. **The file controls your lights:
do not share it.** If it cannot find the keys, it prints the table and column
names (no values) so the search can be adjusted.

A Bluetooth SIG Mesh Configuration Database JSON (for example from nRF Mesh)
also loads.

## Pairing in the app

1. Fader Bay → **PAIR LIGHT** → **BLUETOOTH**.
2. **LOAD MESH FILE**, or type the NetKey, AppKey and the lights
   (one per line: mesh address and name, e.g. `2 Key Light`).
3. **CONNECT VIA BLUETOOTH**, and pick any light in the browser chooser.
4. **IMPORT ALL**, or pick one light.

If the Bluetooth link drops, the app retries every 3 s and resends the current
state.

## Known limits

- Not yet tested on real lights from this app: the crypto passes the
  Bluetooth Mesh spec sample data (`npm run test:ble`), and the commands were
  checked against a simulated light.
- **Adding a new light from factory state (provisioning) is not done yet.**
- No state is read back from the lights yet: changes made on the light do not
  move the faders.
- Identify blinks the intensity; light effects run in the console.
- "This device address" (default `0001`) and the sequence number must not
  clash with another controller. The sequence number starts high and only goes
  up (saved in the browser).

Code: `src/services/ble/meshCrypto.ts` (mesh crypto and PDUs),
`src/services/ble/telink.ts` (light payloads), `src/services/ble/meshLink.ts`
(Web Bluetooth session, throttled sender), `scripts/export-amaran-mesh.mjs`.
