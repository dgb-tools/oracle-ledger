// Explorer walk: every block from activation to tip, coinbase oracle bundle decoded.
// Resumable, chunked, hash-chain checked. Writes data/blocks.jsonl (one row per height).
import fs from "node:fs";
import { readBlock } from "./rawblock.js";
import { findOracleBundle } from "dgb-digidollar-codec";

const EXPLORER = process.env.EXPLORER || "https://digiexplorer.info/api";
const START = Number(process.env.START || 23869440);
const CONC = Number(process.env.CONCURRENCY || 24);
const OUT = process.env.OUT || "data/blocks.jsonl";
const STATE = OUT + ".state.json";
const RAW_DIR = process.env.RAW_DIR || null;      // persist raw blocks: raw-<chunkStart>.bin + .idx.jsonl (height,offset,len)
const NO_ROWS = process.env.NO_ROWS === "1";      // raw-only backfill mode
const END = process.env.END ? Number(process.env.END) : null;
const UA = "dgb-tools/oracle-ledger walker (github.com/dgb-tools)";

async function get(path, raw = false, tries = 8) {
  let delay = 500;
  for (let t = 1; t <= tries; t++) {
    try {
      const r = await fetch(EXPLORER + path, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
      if (r.status === 429 || r.status >= 500) throw new Error("HTTP " + r.status);
      if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { fatal: r.status === 404 });
      return raw ? Buffer.from(await r.arrayBuffer()) : await r.text();
    } catch (e) {
      if (e.fatal || t === tries) throw e;
      await new Promise((res) => setTimeout(res, delay)); delay = Math.min(delay * 2, 15000);
    }
  }
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}
function loadState() {
  if (fs.existsSync(STATE)) return JSON.parse(fs.readFileSync(STATE, "utf8"));
  return { next: START, lastHash: null, rows: 0, started: new Date().toISOString() };
}
async function main() {
  const st = loadState();
  const tip = END ?? Number(await get("/blocks/tip/height"));
  if (RAW_DIR) fs.mkdirSync(RAW_DIR, { recursive: true });
  console.error(`walk ${st.next}..${tip} (${tip - st.next + 1} blocks) conc=${CONC} out=${OUT}`);
  const fd = fs.openSync(OUT, "a");
  const CHUNK = CONC * 10;
  for (let h0 = st.next; h0 <= tip; h0 += CHUNK) {
    const h1 = Math.min(h0 + CHUNK - 1, tip);
    // headers: /blocks/:height returns 10 blocks ending at :height (descending)
    const tops = []; for (let t = h1; t >= h0; t -= 10) tops.push(t);
    const meta = new Map();
    await pool(tops, CONC, async (t) => { for (const blk of JSON.parse(await get(`/blocks/${t}`))) if (blk.height >= h0 && blk.height <= h1) meta.set(blk.height, blk); });
    for (let h = h0; h <= h1; h++) if (!meta.has(h)) throw new Error(`missing header ${h}`);
    const heights = []; for (let h = h0; h <= h1; h++) heights.push(h); const rawKeep = [];
    const rows = await pool(heights, CONC, async (h) => {
      const m = meta.get(h); const raw = await get(`/block/${m.id}/raw`, true); const blk = readBlock(raw); if (RAW_DIR) rawKeep.push([h, raw]);
      if (m.previousblockhash && blk.header.prev !== m.previousblockhash) throw new Error(`header/prev mismatch at ${h}`);
      const f = findOracleBundle(blk.coinbase); const r = f.record;
      return { height: h, hash: m.id, prev: blk.header.prev, time: blk.header.time, ntx: blk.ntx, size: blk.size,
        oracle_present: f.present, oracle_outputs: f.oracleOutputs,
        version: r?.version ?? null, valid: r?.valid ?? null, reason: r?.reason ?? null,
        epoch: r?.epoch ?? null, price_micro_usd: r?.priceMicroUsd ?? null, bundle_timestamp: r?.timestamp ?? null,
        bitmap_hex: r?.bitmapHex ?? null, slots: r?.slots ?? null, signer_count: r?.signerCount ?? null,
        script_hex: f.script, source: "digiexplorer" };
    });
    // hash-chain check across the chunk and against the previous chunk
    let last = st.lastHash;
    for (const r of rows) { if (last && r.prev !== last) throw new Error(`hash chain broken at ${r.height}: prev ${r.prev} != ${last}`); last = r.hash; }
    if (RAW_DIR) { const cs = Math.floor(h0 / 20000) * 20000; const bin = `${RAW_DIR}/raw-${cs}.bin`, idx = `${RAW_DIR}/raw-${cs}.idx.jsonl`; let off = fs.existsSync(bin) ? fs.statSync(bin).size : 0; const bfd = fs.openSync(bin, "a"), ifd = fs.openSync(idx, "a"); for (const [h, raw] of rawKeep.sort((a, b) => a[0] - b[0])) { fs.writeSync(bfd, raw); fs.writeSync(ifd, JSON.stringify({ h, o: off, n: raw.length }) + "\n"); off += raw.length; } fs.closeSync(bfd); fs.closeSync(ifd); }
    if (!NO_ROWS) fs.writeSync(fd, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    st.next = h1 + 1; st.lastHash = last; st.rows += rows.length; st.updated = new Date().toISOString(); st.tip_seen = tip;
    fs.writeFileSync(STATE, JSON.stringify(st, null, 2));
    if (((h1 - START) % 2400) < CHUNK) console.error(`${new Date().toISOString().slice(11, 19)} at ${h1} (${((h1 - START) / (tip - START) * 100).toFixed(1)}%) rows=${st.rows}`);
  }
  fs.closeSync(fd); console.error("done", JSON.stringify(st));
}
main().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
