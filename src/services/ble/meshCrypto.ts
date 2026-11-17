/**
 * Bluetooth Mesh crypto (Mesh Profile spec 1.0.1, section 3.8) and the
 * network / proxy PDU encoding used to talk to a mesh node over its Proxy
 * GATT service.
 *
 * Pure JS (@noble/ciphers), no WebCrypto: AES-ECB, AES-CMAC and AES-CCM.
 * Verified against the spec sample data in scripts/test-ble-mesh.ts.
 */
import { cmac, ecb } from '@noble/ciphers/aes.js';

export const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export function fromHex(s: string): Uint8Array {
  const clean = s.replace(/[^0-9a-f]/gi, '');
  if (clean.length % 2) throw new Error('Odd hex length');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const concat = (...parts: (Uint8Array | number[])[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

const u16 = (v: number) => [(v >> 8) & 0xff, v & 0xff];
const u24 = (v: number) => [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
const u32 = (v: number) => [(v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];

export const aesEcb = (key: Uint8Array, block: Uint8Array) => ecb(key, { disablePadding: true }).encrypt(block);
export const aesCmac = (key: Uint8Array, msg: Uint8Array) => cmac(msg, key);

/** AES-CCM (RFC 3610), 13-byte nonce, L = 2. Returns ciphertext || MIC. */
export function ccmEncrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  plaintext: Uint8Array,
  micLen: 4 | 8,
  aad: Uint8Array = new Uint8Array(0),
): Uint8Array {
  if (nonce.length !== 13) throw new Error('CCM nonce must be 13 bytes');
  const e = (b: Uint8Array) => aesEcb(key, b);
  const block = (flags: number, counterOrLen: number) => concat([flags], nonce, u16(counterOrLen));

  // CBC-MAC over B0, the associated data and the message.
  let x = e(block((aad.length ? 0x40 : 0) | (((micLen - 2) / 2) << 3) | 1, plaintext.length));
  const mac = (data: Uint8Array) => {
    for (let i = 0; i < data.length; i += 16) {
      const chunk = new Uint8Array(16);
      chunk.set(data.subarray(i, i + 16));
      for (let j = 0; j < 16; j++) chunk[j] ^= x[j];
      x = e(chunk);
    }
  };
  if (aad.length) mac(concat(u16(aad.length), aad));
  mac(plaintext);

  const out = new Uint8Array(plaintext.length + micLen);
  for (let i = 0; i < plaintext.length; i += 16) {
    const s = e(block(1, i / 16 + 1));
    for (let j = 0; j < 16 && i + j < plaintext.length; j++) out[i + j] = plaintext[i + j] ^ s[j];
  }
  const s0 = e(block(1, 0));
  for (let j = 0; j < micLen; j++) out[plaintext.length + j] = x[j] ^ s0[j];
  return out;
}

/** AES-CCM decrypt. Returns the plaintext or null if the MIC does not match. */
export function ccmDecrypt(key: Uint8Array, nonce: Uint8Array, sealed: Uint8Array, micLen: 4 | 8): Uint8Array | null {
  if (sealed.length < micLen) return null;
  const n = sealed.length - micLen;
  const e = (b: Uint8Array) => aesEcb(key, b);
  const plain = new Uint8Array(n);
  for (let i = 0; i < n; i += 16) {
    const s = e(concat([1], nonce, u16(i / 16 + 1)));
    for (let j = 0; j < 16 && i + j < n; j++) plain[i + j] = sealed[i + j] ^ s[j];
  }
  const check = ccmEncrypt(key, nonce, plain, micLen);
  for (let j = 0; j < micLen; j++) if (check[n + j] !== sealed[n + j]) return null;
  return plain;
}

const ZERO16 = new Uint8Array(16);
const ascii = (s: string) => new TextEncoder().encode(s);
export const s1 = (m: Uint8Array) => aesCmac(ZERO16, m);

export interface NetworkKeys {
  nid: number;
  encryptionKey: Uint8Array;
  privacyKey: Uint8Array;
}

/** k2 with P = 0x00 (managed flooding credentials). */
export function k2(netKey: Uint8Array, p: Uint8Array = new Uint8Array([0])): NetworkKeys {
  const t = aesCmac(s1(ascii('smk2')), netKey);
  const t1 = aesCmac(t, concat(p, [0x01]));
  const t2 = aesCmac(t, concat(t1, p, [0x02]));
  const t3 = aesCmac(t, concat(t2, p, [0x03]));
  return { nid: t1[15] & 0x7f, encryptionKey: t2, privacyKey: t3 };
}

/** k4: Application key identifier (AID). */
export function k4(appKey: Uint8Array): number {
  const t = aesCmac(s1(ascii('smk4')), appKey);
  return aesCmac(t, concat(ascii('id6'), [0x01]))[15] & 0x3f;
}

// ---------------------------------------------------------------------------
// PDUs

export interface NetworkParams {
  keys: NetworkKeys;
  ivIndex: number;
  ctl: boolean;
  ttl: number;
  seq: number;
  src: number;
  dst: number;
  /** Lower transport PDU (already app-encrypted for access messages). */
  transportPdu: Uint8Array;
  /** 'network' for regular PDUs, 'proxy' for proxy configuration messages. */
  nonceType?: 'network' | 'proxy';
}

/** Network PDU: IVI|NID, obfuscated header, encrypted DST + transport, NetMIC. */
export function encodeNetworkPdu(p: NetworkParams): Uint8Array {
  const ctlTtl = ((p.ctl ? 1 : 0) << 7) | (p.ttl & 0x7f);
  const nonce = concat(
    [p.nonceType === 'proxy' ? 0x03 : 0x00, p.nonceType === 'proxy' ? 0x00 : ctlTtl],
    u24(p.seq),
    u16(p.src),
    [0, 0],
    u32(p.ivIndex),
  );
  const micLen = p.ctl ? 8 : 4;
  const encrypted = ccmEncrypt(p.keys.encryptionKey, nonce, concat(u16(p.dst), p.transportPdu), micLen);

  const pecbInput = concat([0, 0, 0, 0, 0], u32(p.ivIndex), encrypted.subarray(0, 7));
  const pecb = aesEcb(p.keys.privacyKey, pecbInput);
  const header = concat([ctlTtl], u24(p.seq), u16(p.src));
  for (let i = 0; i < 6; i++) header[i] ^= pecb[i];

  return concat([((p.ivIndex & 1) << 7) | p.keys.nid], header, encrypted);
}

/** Unsegmented access message, encrypted with the application key. */
export function encodeAccessTransport(opts: {
  appKey: Uint8Array;
  aid: number;
  ivIndex: number;
  seq: number;
  src: number;
  dst: number;
  accessPdu: Uint8Array;
}): Uint8Array {
  if (opts.accessPdu.length > 11) throw new Error('Access PDU too long for an unsegmented message');
  const nonce = concat([0x01, 0x00], u24(opts.seq), u16(opts.src), u16(opts.dst), u32(opts.ivIndex));
  const upper = ccmEncrypt(opts.appKey, nonce, opts.accessPdu, 4);
  return concat([0x40 | (opts.aid & 0x3f)], upper);
}

export const PROXY_TYPE = { NETWORK: 0x00, BEACON: 0x01, CONFIG: 0x02, PROVISIONING: 0x03 } as const;

/** Wrap one PDU in a Proxy PDU (SAR = complete message). */
export const proxyPdu = (type: number, pdu: Uint8Array) => concat([type & 0x3f], pdu);

/** Decode a network PDU we received (e.g. Filter Status). Null if not ours. */
export function decodeNetworkPdu(
  pdu: Uint8Array,
  keys: NetworkKeys,
  ivIndex: number,
  nonceType: 'network' | 'proxy' = 'network',
): { ctl: boolean; ttl: number; seq: number; src: number; dst: number; transportPdu: Uint8Array } | null {
  if (pdu.length < 14 || (pdu[0] & 0x7f) !== keys.nid) return null;
  const encrypted = pdu.subarray(7);
  const pecb = aesEcb(keys.privacyKey, concat([0, 0, 0, 0, 0], u32(ivIndex), encrypted.subarray(0, 7)));
  const header = pdu.slice(1, 7);
  for (let i = 0; i < 6; i++) header[i] ^= pecb[i];
  const ctl = (header[0] & 0x80) !== 0;
  const ttl = header[0] & 0x7f;
  const seq = (header[1] << 16) | (header[2] << 8) | header[3];
  const src = (header[4] << 8) | header[5];
  const nonce = concat(
    [nonceType === 'proxy' ? 0x03 : 0x00, nonceType === 'proxy' ? 0x00 : header[0]],
    u24(seq),
    u16(src),
    [0, 0],
    u32(ivIndex),
  );
  const plain = ccmDecrypt(keys.encryptionKey, nonce, encrypted, ctl ? 8 : 4);
  if (!plain) return null;
  return { ctl, ttl, seq, src, dst: (plain[0] << 8) | plain[1], transportPdu: plain.subarray(2) };
}

/** Decrypt an unsegmented access message. Null if it is not for this app key. */
export function decodeAccessTransport(
  lower: Uint8Array,
  appKey: Uint8Array,
  aid: number,
  ivIndex: number,
  seq: number,
  src: number,
  dst: number,
): Uint8Array | null {
  if (lower.length < 5 || (lower[0] & 0x80) || (lower[0] & 0x7f) !== (0x40 | aid)) return null;
  const nonce = concat([0x01, 0x00], u24(seq), u16(src), u16(dst), u32(ivIndex));
  return ccmDecrypt(appKey, nonce, lower.subarray(1), 4);
}
