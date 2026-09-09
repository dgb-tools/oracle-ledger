# dgb-oracle-ledger

The DigiDollar **oracle signing-participation ledger**: a walk over every DigiByte mainnet
coinbase since DigiDollar activation (height 23,869,440), decoding the `OP_ORACLE` price
bundle each block carries and recording which of the 35 oracle slots are set in its
participation bitmap. Published at [dgbinsights.com/oracles](https://dgbinsights.com/oracles)
with per-epoch rows, per-slot totals, daily series, an absence-association matrix, and a
provenance manifest per snapshot.

**Read [METHODOLOGY.md](METHODOLOGY.md) first.** The bitmap is the signing set the MuSig2
aggregator chose for that epoch — a lottery-selected threshold subset of the oracles that
participated — so the figures here are *signing participation*, never uptime or liveness.
Slots are numbers. No operator identity is ingested or published.

## Run

```bash
npm install                      # pulls dgb-digidollar-codec (the decoder lives there)
npm run walk                     # resumable explorer walk → data/blocks.jsonl
npm run aggregate                # snapshot at tip−720 → data/snapshots/<id>/
npm test
```

Environment: `EXPLORER` (default `https://digiexplorer.info/api`), `START`, `CONCURRENCY`
(default 24), `OUT`, `SETTLE` (default 720), `SNAPSHOT_END`.

## Files

- `src/rawblock.js` — raw block reader (header + coinbase outputs), no external deps
- `src/walk.js` — chunked, hash-chain-checked, resumable walk; one JSONL row per height
- `src/aggregate.js` — epochs (one observation per unique epoch + signature), per-slot
  totals, 24-hour-delayed daily series, phi absence association, coverage, invariants,
  snapshot manifest, `SHA256SUMS`
- `schema/oracle-ledger.schema.json` — row shapes
- `snapshots/` — manifests and checksums of published snapshots (data lives on the site)

Independent community project, part of [dgb-tools](https://github.com/dgb-tools). Not
affiliated with the DigiByte Foundation. MIT.
