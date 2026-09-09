# Methodology — DigiDollar oracle signing-participation ledger

**What this measures.** For every DigiByte mainnet block since DigiDollar activation
(height 23,869,440), whether the coinbase carries an oracle price bundle, and if so which
of the 35 oracle slots are set in its participation bitmap. **The bitmap records the
signing set the MuSig2 aggregator used for that epoch — a threshold subset, not a roster
of who was online.** Every valid bundle observed so far carries exactly the consensus
threshold of 7 signers while our node sees messages from many more oracles in the same
minutes. The per-slot figures here are therefore *signing participation* (selection
frequency), never uptime or liveness. `SelectOraclesForEpoch` in Core v9.26.5 returns all
35 slots; there is no per-epoch committee exclusion. **How the 7 are chosen** (Core v9.26.5,
`src/oracle/musig2_session.cpp`, signer selection): every oracle that submitted a nonce for
the epoch is ranked by a hash of (epoch, oracle id, selection seed), and the lowest-ranked
7 sign. Selection is therefore a per-epoch lottery among *participating* oracles. A slot
that participates in every epoch is expected to be selected in about 7/N of them, where N
is the number participating that epoch. Two continuously participating slots have equal
expected rates; a slot whose rate sits well below its peers was absent from sessions, not
disfavored. The ledger publishes the rates; it does not estimate N.

**Source of truth and label.** Blocks are fetched as raw bytes from digiexplorer.info's
Esplora API and parsed structurally (header, coinbase outputs). The public label is exactly
*explorer-derived; node-cross-checked for heights X–Y*, where X–Y is the range our own
node has independently walked; it is empty until that walk exists. Whole-range agreement
between the explorer walk and a node walk is the release gate; until then every artifact is
labeled **preview**. Core's `getoraclesigners` (last 1..1000 blocks) is a third derivation
for the tail only.

**Script and decode (Core v9.26.5, `src/oracle/bundle_manager.cpp`,
`src/oracle/musig2_aggregator.cpp`).** The bundle is `OP_RETURN OP_ORACLE <push 0x03>
<push payload>`; payload = `bitmap_len(1) · bitmap · epoch(4 LE) · price(8 LE, micro-USD) ·
timestamp(8 LE, unix s) · aggregate_sig(64)`; total `1+bitmap_len+4+8+8+64`. Bitmap length
must equal ⌈roster/8⌉ (5 for 35); bits at or above the roster must be zero; bit *b* of
byte *j* is slot 8*j*+*b*. Any violation invalidates the whole bundle (fail closed, with a
reason). Scripts are located structurally, never by searching output hex for `bf`.
Roster and threshold are versioned by height (mainnet: 35 / 7 since activation).

**Epochs.** Epoch id = ⌊height / nDDOracleEpochBlocks⌋ (mainnet 40). The walker records
the payload epoch and the aggregator checks it against the height-derived epoch; a mismatch
is recorded, never silently corrected. A bundle is repeated byte-identically in several
consecutive blocks of its epoch. **One observation per unique (epoch, aggregate_sig).**
Coverage separately counts every copy, every epoch with ≥1 valid bundle, duplicate-bundle
epochs (two distinct signatures in one epoch), and epochs with none. Missing bundles are
allowed by consensus except on price-dependent DigiDollar blocks, so `no_bundle` is a
coverage state and is never charged to any slot.

**Per-slot states.** Within a valid bundle a slot is `signed` (bit set) or `missed` (bit
clear). `not_eligible` applies only to the height/roster relation (a slot outside the
roster at that height); on current mainnet it cannot occur inside a valid bundle.
`no_bundle` is block-level coverage. Primary rate = signed / (signed + missed) over unique
bundle observations. Consensus requires signer_count ≥ 7 (`ValidateMuSig2Bundle`); a
bundle we mark valid with fewer fails the run; more than 7 is recorded, not failed.
No "quorum margin" chart is published — with exactly 7 it is identically zero and is kept
only as an invariant.

**Absence association.** For each pair of slots, over unique observations: a 2×2 table of
joint absence / single absence / joint presence, and the phi (Matthews) coefficient with n.
`null` when any margin is zero. Named *absence association*, never coordination or
causation. Under random 7-of-35 selection the expected phi between two absence series is
slightly negative; a small negative is not anti-coordination. Positive phi is the only
chain-visible clustering, and it is still non-selection, not liveness.

**Reorgs and snapshots.** The walk verifies the hash chain from activation (each block's
`prev` equals the previous hash). Live preview runs through the tip and is provisional.
Immutable snapshots end at tip − 720 (~3 hours). Snapshot id `mainnet-<height>-<hash8>`.
If any finalized hash changes, the snapshot is regenerated, never patched.

**Harm mitigation.** Slots are numbers in numeric order; no rankings, no "best/worst", no
live "currently failing" surface. Per-slot daily aggregates are published with a 24-hour
delay. No operator names, IPs, ASNs, geography, endpoints or identity fields are ingested
or published — Core's `signers[]` identity fields and `OracleDisplayName` are never read.
Slot-to-person attribution is neither made nor verified here. The per-block JSONL is
downloadable because it reproduces public-chain facts.

**Determinism and provenance.** Artifact rows contain no generation timestamps; canonical
JSON (sorted keys) is hashed and listed in `SHA256SUMS`. `manifest.json` carries network,
activation height, tip height and hash, snapshot end, explorer endpoint, walker and codec
commits, schema version, generation time, row counts, completeness, invariant results and
the label above.

**Instrument.** Cites of the per-slot series or the association matrix, a second party
reproducing a snapshot id, or a mention in Core's oracle planning documents. Not Core
#428 (that is the position-scanner RPC). Ninety days from first public snapshot; if all are
zero, the ledger stays as internal census automation.

**Vocabulary.** "Signing participation", "epochs signed", "recorded in block N",
"tamper-evident", "absence association". Not: uptime, liveness, proof, verified,
coordination, centralization.
