/**
 * Telink vendor payload used by amaran / Aputure lights (Sidus mesh).
 *
 * REVERSE ENGINEERED, not official: ported from wesbos/amaran-BLE-control
 * (src/telink.ts). The payload is 10 bytes, sent as the parameters of the
 * vendor access opcode 0x26 inside a normal Bluetooth Mesh message.
 *   p[0]  = checksum (sum of p[1..9] & 0xff)
 *   p[9]  = command type
 *   p[1..8] = bit-packed values, little-endian
 * A firmware update can change any of this.
 */

export const TELINK_OPCODE = 0x26;

export const TELINK_CMD = {
  STATUS: 0x0e,
  ON_OFF: 0x8c,
  BRIGHTNESS: 0x8f,
  CCT: 0x82,
  HSI: 0x81,
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function finish(p: Uint8Array): Uint8Array {
  let sum = 0;
  for (let i = 1; i < 10; i++) sum += p[i];
  p[0] = sum & 0xff;
  return p;
}

const level = (v: number) => clamp(Math.round(v), 0, 1000);

export function statusRequest(): Uint8Array {
  const p = new Uint8Array(10);
  p[9] = TELINK_CMD.STATUS;
  return finish(p);
}

export function onOff(on: boolean): Uint8Array {
  const p = new Uint8Array(10);
  p[8] = on ? 1 : 0;
  p[9] = TELINK_CMD.ON_OFF;
  return finish(p);
}

/** Intensity 0..1000. */
export function brightness(intensity: number): Uint8Array {
  const v = level(intensity);
  const p = new Uint8Array(10);
  p[7] = (v & 3) << 6;
  p[8] = (v >> 2) & 0xff;
  p[9] = TELINK_CMD.BRIGHTNESS;
  return finish(p);
}

/**
 * CCT in kelvin, intensity 0..1000, gm -10..+10 (0 = neutral, negative =
 * magenta, positive = green).
 */
export function cct(kelvin: number, intensity: number, gm = 0): Uint8Array {
  const v = level(intensity);
  const tcct = clamp(Math.trunc((kelvin + 5) / 10), 80, 2000);
  const g = clamp(Math.round(gm) + 10, 0, 20);
  let low = (BigInt(v & 3) << 62n) | (BigInt(g & 0x7f) << 45n);
  let high = 0x8200 | ((v >> 2) & 0xff);
  if (tcct < 1001) {
    low |= BigInt(tcct) << 52n;
    high |= (tcct >> 12) & 0xff;
  } else {
    // Above 10 000 K the value no longer fits 10 bits: offset + extension flag.
    low |= BigInt((tcct + 0x18) & 0x3ff) << 52n;
    low |= 0x0000040000000000n;
  }
  const p = new Uint8Array(10);
  for (let i = 0; i < 8; i++) p[i] = Number((low >> BigInt(8 * i)) & 0xffn);
  p[8] = high & 0xff;
  p[9] = (high >> 8) & 0xff;
  return finish(p);
}

/** Hue 0..360, saturation 0..100, intensity 0..1000. */
export function hsi(hue: number, saturation: number, intensity: number): Uint8Array {
  const v = level(intensity);
  const h = clamp(Math.round(hue), 0, 360) & 0x1ff;
  const s = clamp(Math.round(saturation), 0, 100) & 0x7f;
  const p = new Uint8Array(10);
  p[5] = (s & 3) << 6;
  p[6] = ((h & 7) << 5) | ((s >> 2) & 0x1f);
  p[7] = ((h >> 3) & 0x3f) | ((v & 3) << 6);
  p[8] = (v >> 2) & 0xff;
  p[9] = TELINK_CMD.HSI;
  return finish(p);
}

/** Access PDU: opcode 0x26 + payload. */
export const accessPdu = (payload: Uint8Array) => {
  const out = new Uint8Array(11);
  out[0] = TELINK_OPCODE;
  out.set(payload, 1);
  return out;
};
