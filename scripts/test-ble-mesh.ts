/**
 * Self-test for the BLE mesh crypto and Telink payloads.
 * Run: npm run test:ble
 *
 * Vectors: Bluetooth Mesh Profile 1.0.1 sample data (section 8), RFC 3610
 * packet vector #1, and the Telink examples in wesbos/amaran-BLE-control.
 */
import {
  ccmDecrypt,
  ccmEncrypt,
  decodeAccessTransport,
  decodeNetworkPdu,
  encodeAccessTransport,
  encodeNetworkPdu,
  fromHex,
  hex,
  k2,
  k4,
  s1,
} from '../src/services/ble/meshCrypto.ts';
import { accessPdu, brightness, cct, hsi, onOff } from '../src/services/ble/telink.ts';

let failed = 0;
function eq(name: string, got: string | number, want: string | number) {
  const ok = String(got).toLowerCase() === String(want).toLowerCase();
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      got  ${got}\n      want ${want}`}`);
}

// s1 / k2 / k4 (spec 8.1)
eq('s1("test")', hex(s1(new TextEncoder().encode('test'))), 'b73cefbd641ef2ea598c2b6efb62f79c');
const k = k2(fromHex('f7a2a44f8e8a8029064f173ddc1e2b00'));
eq('k2 NID', k.nid, 0x7f);
eq('k2 EncryptionKey', hex(k.encryptionKey), '9f589181a0f50de73c8070c7a6d27f46');
eq('k2 PrivacyKey', hex(k.privacyKey), '4c715bd4a64b938f99b453351653124f');
eq('k4 AID', k4(fromHex('3216d1509884b533248541792b877f98')), 0x38);

// RFC 3610 packet vector #1 (M = 8, with associated data)
const rfc = ccmEncrypt(
  fromHex('c0c1c2c3c4c5c6c7c8c9cacbcccdcecf'),
  fromHex('00000003020100a0a1a2a3a4a5'),
  fromHex('08090a0b0c0d0e0f101112131415161718191a1b1c1d1e'),
  8,
  fromHex('0001020304050607'),
);
eq('CCM RFC 3610 #1', hex(rfc), '588c979a61c663d2f066d0c2c0f989806d5f6b61dac38417e8d12cfdf926e0');

// Network PDU, spec 8.3.1 "Message #1" (control message)
const net = k2(fromHex('7dd7364cd842ad18c17c2b820c84c3d6'));
eq('sample NID', net.nid, 0x68);
eq('sample EncryptionKey', hex(net.encryptionKey), '0953fa93e7caac9638f58820220a398e');
eq('sample PrivacyKey', hex(net.privacyKey), '8b84eedec100067d670971dd2aa700cf');
const msg1 = encodeNetworkPdu({
  keys: net,
  ivIndex: 0x12345678,
  ctl: true,
  ttl: 0,
  seq: 1,
  src: 0x1201,
  dst: 0xfffd,
  transportPdu: fromHex('034b50057e400000010000'),
});
eq('Message #1 network PDU', hex(msg1), '68eca487516765b5e5bfdacbaf6cb7fb6bff871f035444ce83a670df');
const back = decodeNetworkPdu(msg1, net, 0x12345678);
eq('Message #1 decode dst', back ? back.dst.toString(16) : 'null', 'fffd');

// Access message round trip (opcode 0x26 + Telink payload)
const appKey = fromHex('63964771734fbd76e3b40519d1d94a48');
const aid = k4(appKey);
const lower = encodeAccessTransport({ appKey, aid, ivIndex: 0, seq: 0x123456, src: 1, dst: 2, accessPdu: accessPdu(onOff(true)) });
eq('access lower PDU length', lower.length, 16);
const netPdu = encodeNetworkPdu({ keys: net, ivIndex: 0, ctl: false, ttl: 10, seq: 0x123456, src: 1, dst: 2, transportPdu: lower });
eq('network PDU length (+ proxy header = 30)', netPdu.length, 29);
const dec = decodeNetworkPdu(netPdu, net, 0);
const access = dec && decodeAccessTransport(dec.transportPdu, appKey, aid, 0, dec.seq, dec.src, dec.dst);
eq('access round trip', access ? hex(access) : 'null', hex(accessPdu(onOff(true))));
eq('CCM tamper detected', ccmDecrypt(appKey, new Uint8Array(13), new Uint8Array(8), 4) === null ? 'null' : 'decrypted', 'null');

// Telink payloads
eq('telink on', hex(onOff(true)), '8d00000000000000018c');
eq('telink off', hex(onOff(false)), '8c00000000000000008c');
eq('telink brightness 750', hex(brightness(750)), 'ca00000000000080bb8f');
eq('telink cct 5600K 800 gm0', hex(cct(5600, 800, 0)), 'ae00000000400123c882');
const h = hsi(240, 100, 1000);
eq('telink hsi checksum', h[0], h.slice(1).reduce((a, b) => a + b, 0) & 0xff);
eq('telink hsi type', h[9], 0x81);

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
