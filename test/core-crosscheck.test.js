import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs";
import { decodeParticipationBitmap, parseOracleScript } from "dgb-digidollar-codec";
const core = JSON.parse(fs.readFileSync(new URL("./vectors/getoraclesigners-1000.json", import.meta.url), "utf8"));
test("our bitmap decode reproduces Core's signer_ids for every bundle in the last 1000 blocks", () => {
  assert.ok(core.bundles.length > 500); let n = 0;
  for (const b of core.bundles) { const d = decodeParticipationBitmap(b.participation_bitmap, core.total_oracle_slots); assert.equal(d.ok, b.bitmap_valid, `valid ${b.height}`); assert.deepEqual(d.slots, b.signer_ids, `slots ${b.height}`); assert.equal(d.slots.length, b.signer_count); n++; }
  assert.equal(n, core.bundles.length);
});
test("Core's threshold and roster match the codec constants", () => { assert.equal(core.required_signers, 7); assert.equal(core.total_oracle_slots, 35); });
