# Creamsource Vortex over Bluetooth ("CRMX BLUETOOTH")

Cine Light OS controls a Creamsource Vortex directly over Bluetooth, with no
CRMX transmitter or cable. Each light has its own Bluetooth link.

This uses **official, public documentation**, not reverse engineering:

- The Vortex has a built-in **LumenRadio TimoTwo** module (CRMX + Bluetooth).
  LumenRadio documents its Bluetooth DMX interface:
  https://docs.lumenrad.io/timotwo/ble-interface/
- Channel layout from Creamsource's **Vortex DMX Tables V3.1**
  (https://knowledge.creamsource.com/vortex-dmx-tables), Mode 8.

## On the light (once)

1. **LINK → CRMX Settings**: turn on **CRMX** and **CRMX BLE**.
2. **LINK → DMX Settings → DMX Mode 8** (16-bit, CCT and Hue/Saturation).
3. **LINK → DMX Settings → DMX Address 1**, or use another address and type
   the same one in the app.
4. Optional: **DMX Smoothing → Smooth** hides the steps of a Bluetooth link.
5. If a Bluetooth PIN was set before: **LINK → CRMX Settings → Remove CRMX BLE
   Pin** (CreamOS 2.5 or later).

Close Luminair, Slyyd and CRMX Toolbox on other phones: the light takes one
Bluetooth app at a time.

## In the app

**PAIR LIGHT → CRMX BLUETOOTH → SEARCH FOR THE LIGHT**, choose the Vortex in
the Bluetooth window (it may show as "TimoTwo"), check the DMX address, then
**PAIR & CONTROL**. Use **ADD ANOTHER LIGHT** for more Vortex units.

Works in the native app (iPhone, iPad, Android), in Chrome / Edge, and in
Bluefy on iPhone.

## What is sent (Mode 8, 14 channels)

| Ch | Function | From the console |
|---|---|---|
| 1-2 | Master level 16-bit | dimmer after curve, grand master, blackout |
| 3-4 | CCT 2200–15000 K | CCT (assumed linear between the end points) |
| 5-6 | Green/Magenta | tint: 35268 neutral, 5001 = full magenta, 65535 = full green |
| 7-8 | CCT ↔ colour crossfade | 0 in CCT mode, 100 % in HSI / XY / gel |
| 9-10 | Hue 0–360° | HSI hue; XY and gels converted to hue/sat |
| 11-12 | Saturation | HSI saturation |
| 13 | Fan | 0 = Auto |
| 14 | Control channel | 0 = no action |

On Bluetooth only changed channels are sent; the module keeps the last values.
All 512 channels go out once, after you pair, because the module turns DMX on
only after that.

## Limits

- Not yet tested on a real Vortex: the packet format passes LumenRadio's own
  examples (`npm run test:ble`), and the flow was checked against a simulated
  light.
- Effects run in the console (dimmer changes), not the Vortex's built-in FX
  modes.
- Bluetooth is slower than CRMX; for many lights or fast effects, use CRMX or
  sACN (the same Mode 8 profile is used).
- After a browser reload, pair again (the browser forgets the Bluetooth
  permission).

Code: `src/services/timo/timoLink.ts` (Bluetooth), `src/data/vortexDmx.ts`
(Mode 8 encoder).
