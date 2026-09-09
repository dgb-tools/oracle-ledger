// Minimal raw-block reader: header + coinbase outputs. Enough to find the oracle script.
function varint(b, i) {
  const v = b[i];
  if (v < 0xfd) return [v, i + 1];
  if (v === 0xfd) return [b[i + 1] | (b[i + 2] << 8), i + 3];
  if (v === 0xfe) return [(b[i + 1] | (b[i + 2] << 8) | (b[i + 3] << 16)) + b[i + 4] * 0x1000000, i + 5];
  return [Number(b.readBigUInt64LE(i + 1)), i + 9];
}
const hexrev = (u8) => Buffer.from(u8).reverse().toString("hex");
export function readBlock(buf) {
  const b = Buffer.from(buf);
  const header = { version: b.readInt32LE(0), prev: hexrev(b.subarray(4, 36)), merkle: hexrev(b.subarray(36, 68)),
    time: b.readUInt32LE(68), bits: b.readUInt32LE(72), nonce: b.readUInt32LE(76) };
  let i = 80; let ntx; [ntx, i] = varint(b, i);
  i += 4; // tx version
  if (b[i] === 0 && b[i + 1] === 1) i += 2; // segwit marker+flag
  let nin; [nin, i] = varint(b, i);
  for (let k = 0; k < nin; k++) { i += 36; let sl; [sl, i] = varint(b, i); i += sl + 4; }
  let nout; [nout, i] = varint(b, i); const vout = [];
  for (let k = 0; k < nout; k++) { const value = Number(b.readBigUInt64LE(i)); i += 8; let sl; [sl, i] = varint(b, i); vout.push({ value, scriptpubkey: b.subarray(i, i + sl).toString("hex") }); i += sl; }
  return { header, ntx, coinbase: { vout }, size: b.length };
}
