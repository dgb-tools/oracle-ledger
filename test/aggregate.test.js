import test from "node:test"; import assert from "node:assert/strict";
test("epoch id from height matches probe epochs (mainnet 40)", () => { assert.equal(Math.floor(24183475 / 40), 604586); assert.equal(Math.floor(24183496 / 40), 604587); assert.equal(Math.floor(23869440 / 40), 596736); });
test("phi: perfect co-absence = 1, independent ≈ 0, zero margin = null", () => {
  const phi = (n11, n10, n01, n00) => { const m = (n11 + n10) * (n01 + n00) * (n11 + n01) * (n10 + n00); return m === 0 ? null : (n11 * n00 - n10 * n01) / Math.sqrt(m); };
  assert.equal(phi(5, 0, 0, 5), 1); assert.equal(phi(0, 5, 5, 0), -1); assert.equal(phi(5, 0, 0, 0), null); assert.ok(Math.abs(phi(25, 25, 25, 25)) < 1e-9);
});
