#!/usr/bin/env node
/**
 * Export the Bluetooth Mesh keys and light addresses that amaran Desktop
 * stores for your Sidus account, so Cine Light OS can talk to the lights
 * directly over Bluetooth.
 *
 *   npm run ble:export-mesh                 (finds amaran.db automatically)
 *   npm run ble:export-mesh -- path/to/amaran.db
 *
 * Writes amaran-mesh.local.json (git-ignored). The file holds your mesh
 * keys: anyone with it can control your lights. Do not share or commit it.
 * Only the counts and light names are printed, never the keys.
 *
 * The database layout is not documented, so this searches every table for
 * key / address columns. If it finds nothing it prints the table and column
 * NAMES (no values) so the search can be adjusted.
 */
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

function findDb() {
  const roots = [
    process.env.APPDATA && join(process.env.APPDATA, 'amaran Desktop'),
    join(homedir(), 'Library', 'Application Support', 'amaran Desktop'),
  ].filter(Boolean);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const d of readdirSync(root, { withFileTypes: true })) {
      const p = join(root, d.name, 'amaran.db');
      if (d.isDirectory() && existsSync(p)) return p;
    }
    if (existsSync(join(root, 'amaran.db'))) return join(root, 'amaran.db');
  }
  return null;
}

const dbPath = process.argv[2] ?? findDb();
if (!dbPath || !existsSync(dbPath)) {
  console.error('amaran.db not found. Pass its path: npm run ble:export-mesh -- "<path to amaran.db>"');
  process.exit(1);
}

// amaran Desktop may hold the file open: work on a copy.
const tmp = mkdtempSync(join(tmpdir(), 'amaran-mesh-'));
const copy = join(tmp, 'amaran.db');
copyFileSync(dbPath, copy);
for (const ext of ['-wal', '-shm']) if (existsSync(dbPath + ext)) copyFileSync(dbPath + ext, copy + ext);
const db = new DatabaseSync(copy, { readOnly: true });

const toKey = (v) => {
  if (v instanceof Uint8Array && v.length === 16) return Buffer.from(v).toString('hex');
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (/^[0-9a-f]{32}$/i.test(t.replace(/[-\s]/g, ''))) return t.replace(/[-\s]/g, '').toLowerCase();
  if (/^[A-Za-z0-9+/]{22}==$/.test(t)) return Buffer.from(t, 'base64').toString('hex');
  return null;
};
const toAddr = (v) => {
  const n = typeof v === 'string' ? (/^0x/i.test(v) ? parseInt(v, 16) : /^[0-9a-f]{4}$/i.test(v) ? parseInt(v, 16) : Number(v)) : Number(v);
  return Number.isInteger(n) && n > 0 && n < 0x8000 ? n : null;
};

const netKeys = new Set();
const appKeys = new Set();
let ivIndex;
const nodes = new Map();
const schema = [];

const NET_RE = /net_?key|netkey|network_?key/i;
const APP_RE = /app_?key|appkey|application_?key/i;
const IV_RE = /iv_?index/i;
const ADDR_RE = /unicast|mesh_?addr|node_?addr|element_?addr|^addr(ess)?$|^mesh_?id$/i;
const NAME_RE = /^(name|nick_?name|alias|title|device_?name|fixture_?name|display_?name)$/i;
const MODEL_RE = /^(model|product|product_?name|type_?name|device_?type)$/i;

function scanJson(text) {
  if (typeof text !== 'string' || text.length > 2_000_000 || !/key/i.test(text) || !/^\s*[[{]/.test(text)) return;
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return;
  }
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (NET_RE.test(k) && toKey(v)) netKeys.add(toKey(v));
      else if (APP_RE.test(k) && toKey(v)) appKeys.add(toKey(v));
      else if ((k === 'netKeys' || k === 'appKeys') && Array.isArray(v)) {
        for (const e of v) if (toKey(e?.key)) (k === 'netKeys' ? netKeys : appKeys).add(toKey(e.key));
      } else if (IV_RE.test(k) && Number.isInteger(v)) ivIndex ??= v;
      else if (typeof v === 'object') walk(v);
    }
  };
  walk(j);
}

const tables = db.prepare("select name from sqlite_master where type = 'table'").all().map((r) => r.name);
for (const table of tables) {
  const cols = db.prepare(`pragma table_info("${table.replace(/"/g, '""')}")`).all().map((c) => c.name);
  schema.push(`${table}(${cols.join(', ')})`);
  const netCol = cols.find((c) => NET_RE.test(c));
  const appCol = cols.find((c) => APP_RE.test(c));
  const ivCol = cols.find((c) => IV_RE.test(c));
  const addrCol = cols.find((c) => ADDR_RE.test(c));
  const nameCol = cols.find((c) => NAME_RE.test(c));
  const modelCol = cols.find((c) => MODEL_RE.test(c));
  const rows = db.prepare(`select * from "${table.replace(/"/g, '""')}" limit 5000`).all();
  for (const row of rows) {
    if (netCol && toKey(row[netCol])) netKeys.add(toKey(row[netCol]));
    if (appCol && toKey(row[appCol])) appKeys.add(toKey(row[appCol]));
    if (ivCol && Number.isInteger(Number(row[ivCol]))) ivIndex ??= Number(row[ivCol]);
    if (addrCol && nameCol) {
      const address = toAddr(row[addrCol]);
      if (address && !nodes.has(address)) {
        nodes.set(address, {
          address,
          name: String(row[nameCol] ?? `Light ${address}`),
          ...(modelCol && row[modelCol] ? { modelName: String(row[modelCol]) } : {}),
        });
      }
    }
    for (const c of cols) scanJson(row[c]);
  }
}
db.close();
rmSync(tmp, { recursive: true, force: true });

console.log(`Database: ${dbPath}`);
console.log(`NetKeys found: ${netKeys.size} · AppKeys found: ${appKeys.size} · lights: ${nodes.size}`);
for (const n of nodes.values()) console.log(`  ${n.address}\t${n.name}${n.modelName ? ` (${n.modelName})` : ''}`);

if (!netKeys.size || !appKeys.size) {
  console.log('\nCould not find the mesh keys. Table and column names (no values):');
  for (const s of schema) console.log('  ' + s);
  console.log('\nSend this list (it has no secrets) so the search can be adjusted.');
  process.exit(2);
}
if (netKeys.size > 1 || appKeys.size > 1) {
  console.log('\nMore than one key found: the first of each was used. If the lights do not respond, tell me.');
}

const out = {
  format: 'cinelight-ble-mesh/1',
  netKey: [...netKeys][0],
  appKey: [...appKeys][0],
  ivIndex: ivIndex ?? 0,
  src: 1,
  nodes: [...nodes.values()].sort((a, b) => a.address - b.address),
};
const file = join(process.cwd(), 'amaran-mesh.local.json');
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`\nSaved ${file}`);
console.log('In Cine Light OS: PAIR LIGHT → BLUETOOTH → LOAD MESH FILE. Keep this file private.');
