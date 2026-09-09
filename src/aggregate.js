// Aggregate the walk into a snapshot under METHODOLOGY.md. No timestamps inside rows.
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto"; import { execSync } from "node:child_process";
import { parseOracleScript } from "dgb-digidollar-codec";
const IN = process.env.IN || "data/blocks.jsonl"; const OUTDIR = process.env.OUTDIR || "data/snapshots";
const ACTIVATION = 23869440, EPOCH_BLOCKS = Number(process.env.EPOCH_BLOCKS || 40), ROSTER = 35, THRESHOLD = 7, SETTLE = Number(process.env.SETTLE || 720), DELAY_S = 86400;
const rows = fs.readFileSync(IN, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const tip = rows[rows.length - 1]; const endH = process.env.SNAPSHOT_END ? Number(process.env.SNAPSHOT_END) : tip.height - SETTLE;
const blocks = rows.filter((r) => r.height <= endH); if (blocks.length === 0) throw new Error("nothing to snapshot");
for (let i = 1; i < blocks.length; i++) if (blocks[i].prev !== blocks[i - 1].hash || blocks[i].height !== blocks[i - 1].height + 1) throw new Error(`chain break at ${blocks[i].height}`);
const end = blocks[blocks.length - 1]; const snapId = `mainnet-${end.height}-${end.hash.slice(0, 8)}`;
const inv = { epoch_mismatch: 0, valid_below_threshold: 0, above_threshold: 0, invalid_bundles: 0, multi_oracle_outputs: 0 };
// epochs: one observation per (epoch, aggregate_sig)
const ep = new Map();
for (const b of blocks) {
  if (!b.oracle_present) continue; if (b.oracle_outputs > 1) inv.multi_oracle_outputs++;
  const r = parseOracleScript(b.script_hex, { roster: ROSTER, threshold: THRESHOLD });
  if (!r || !r.valid) { inv.invalid_bundles++; continue; }
  if (r.signerCount < THRESHOLD) inv.valid_below_threshold++; if (r.signerCount > THRESHOLD) inv.above_threshold++;
  const hEpoch = Math.floor(b.height / EPOCH_BLOCKS); if (hEpoch !== r.epoch) inv.epoch_mismatch++;
  const e = ep.get(r.epoch) || { epoch: r.epoch, first_height: b.height, last_height: b.height, copies: 0, sigs: new Map(), first_block_time: b.time, epoch_from_height_match: hEpoch === r.epoch };
  e.copies++; e.last_height = b.height;
  const s = e.sigs.get(r.aggregateSigHex) || { slots: r.slots, signer_count: r.signerCount, price_micro_usd: r.priceMicroUsd, bundle_timestamp: r.timestamp, first_height: b.height, first_block_time: b.time };
  e.sigs.set(r.aggregateSigHex, s); ep.set(r.epoch, e);
}
const epochs = [...ep.values()].sort((a, b) => a.epoch - b.epoch).map((e) => ({ epoch: e.epoch, first_height: e.first_height, last_height: e.last_height, copies: e.copies, signatures: e.sigs.size,
  observations: [...e.sigs.values()], epoch_from_height_match: e.epoch_from_height_match }));
const obs = epochs.flatMap((e) => e.observations.map((o) => ({ epoch: e.epoch, ...o })));
const expectedEpochs = Math.floor(end.height / EPOCH_BLOCKS) - Math.floor(ACTIVATION / EPOCH_BLOCKS) + 1;
const coverage = { blocks: blocks.length, first_height: blocks[0].height, end_height: end.height, blocks_with_bundle: blocks.filter((b) => b.oracle_present).length,
  expected_epochs: expectedEpochs, epochs_with_bundle: epochs.length, epochs_without_bundle: expectedEpochs - epochs.length, duplicate_bundle_epochs: epochs.filter((e) => e.signatures > 1).length,
  unique_observations: obs.length, bundle_copies_total: epochs.reduce((a, e) => a + e.copies, 0) };
// per-slot totals
const slots = Array.from({ length: ROSTER }, (_, s) => { const signed = obs.filter((o) => o.slots.includes(s)).length; const missed = obs.length - signed; return { slot: s, signed, missed, rate: obs.length ? +(signed / obs.length).toFixed(6) : null }; });
// per-slot per-day with 24h delay (day of first block time of the observation), unique observations only
const cutoff = end.time - DELAY_S; const days = new Map();
for (const o of obs) { if (o.first_block_time > cutoff) continue; const d = new Date(o.first_block_time * 1000).toISOString().slice(0, 10); const row = days.get(d) || { day: d, observations: 0, distinct_signers: new Set(), signed: Array(ROSTER).fill(0) }; row.observations++; for (const s of o.slots) { row.signed[s]++; row.distinct_signers.add(s); } days.set(d, row); }
const slotDays = [...days.values()].sort((a, b) => a.day.localeCompare(b.day)).map((r) => ({ day: r.day, observations: r.observations, distinct_signers: r.distinct_signers.size, signed: r.signed }));
// absence association: phi over unique observations
const assoc = []; const n = obs.length;
for (let a = 0; a < ROSTER; a++) for (let b = a + 1; b < ROSTER; b++) { let n11 = 0, n10 = 0, n01 = 0, n00 = 0; for (const o of obs) { const A = !o.slots.includes(a), B = !o.slots.includes(b); if (A && B) n11++; else if (A) n10++; else if (B) n01++; else n00++; }
  const m = (n11 + n10) * (n01 + n00) * (n11 + n01) * (n10 + n00); const phi = m === 0 ? null : +(((n11 * n00 - n10 * n01) / Math.sqrt(m)).toFixed(6));
  assoc.push({ a, b, n, both_absent: n11, a_absent_only: n10, b_absent_only: n01, both_present: n00, phi }); }
// write snapshot
const dir = path.join(OUTDIR, snapId); fs.mkdirSync(dir, { recursive: true });
const canon = (o) => JSON.stringify(o, Object.keys(o).sort());
const files = { "epochs.jsonl": epochs.map(canon).join("\n") + "\n", "slots.json": JSON.stringify(slots, null, 1), "slot-days.json": JSON.stringify(slotDays, null, 1), "association.json": JSON.stringify(assoc), "coverage.json": JSON.stringify(coverage, null, 1) };
// per-block rows in 20k-height chunks (Pages file-size limit)
for (let h0 = blocks[0].height; h0 <= end.height; h0 += 20000) { const chunk = blocks.filter((b) => b.height >= h0 && b.height < h0 + 20000); files[`blocks-${h0}.jsonl`] = chunk.map(canon).join("\n") + "\n"; }
const sums = []; for (const [name, body] of Object.entries(files)) { fs.writeFileSync(path.join(dir, name), body); sums.push(`${crypto.createHash("sha256").update(body).digest("hex")}  ${name}`); }
fs.writeFileSync(path.join(dir, "SHA256SUMS"), sums.join("\n") + "\n");
const git = (c) => { try { return execSync(c, { encoding: "utf8" }).trim(); } catch { return null; } };
const manifest = { snapshot_id: snapId, network: "digibyte-mainnet", status: "preview", label: "explorer-derived; node-cross-checked for heights (none yet)", activation_height: ACTIVATION, snapshot_end_height: end.height, snapshot_end_hash: end.hash, snapshot_end_time: end.time,
  walk_tip_height: tip.height, settle_blocks: SETTLE, epoch_blocks: EPOCH_BLOCKS, roster: ROSTER, threshold: THRESHOLD, source: "https://digiexplorer.info/api (raw blocks)", walker_commit: git("git rev-parse HEAD"), codec_version: JSON.parse(fs.readFileSync("node_modules/dgb-digidollar-codec/package.json", "utf8")).version,
  schema_version: "0.1.0", generated_at: new Date().toISOString(), coverage, invariants: inv, per_slot_daily_delay_seconds: DELAY_S, files: Object.keys(files) };
fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 1));
fs.writeFileSync(path.join(OUTDIR, "..", "latest.json"), JSON.stringify({ snapshot_id: snapId, status: "preview", end_height: end.height, end_hash: end.hash, epochs_with_bundle: coverage.epochs_with_bundle, expected_epochs: coverage.expected_epochs, unique_observations: coverage.unique_observations, generated_at: manifest.generated_at }, null, 1));
console.error(JSON.stringify({ snapId, coverage, invariants: inv, slots: slots.map((s) => s.rate) }, null, 1));
