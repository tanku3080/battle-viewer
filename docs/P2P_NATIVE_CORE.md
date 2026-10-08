# Phase 2a: native content and local cache

This phase implements `crates/battle-p2p-core`, an independent Rust library for the
future Tauri service. It is executable and tested without a GUI. It does **not**
start a network service, publish metadata, download from peers or enable sharing.
The existing Web/Tauri application, authentication, local JSON import/export and
Creator UI remain on their existing paths. Tauri IPC and consent/settings UI are
Phase 2b; the library is deliberately not wired to an unauthenticated listener.

## Basis and dependencies

- FE develop: `58f475895bab2884f0218ccd757b13dd1a8b0fe7`.
- BE develop: `c37093f180cb5ec2d29b158d49efe77cdc01ceac`.
- [FE Phase 0 #44](https://github.com/tanku3080/battle-viewer/pull/44) and
  [BE Phase 1 #7](https://github.com/tanku3080/battle-hub/pull/7) are open/unmerged
  at implementation time. This branch starts at develop and has no cherry-picked
  commits or runtime dependency on either PR. Its protocol matches their v1 fields.
  Their implementation must be reviewed/merged before later Hub integration.
- Rust edition 2024 / MSRV 1.90, matching Tauri. Commit the independent Cargo.lock.

## Content contract

`content::encode` validates and compresses original UTF-8 bytes, without
reserializing JSON. `content::decode` checks manifest, exact wire size, compressed
SHA-256, bounded gzip inflation, exact raw size, raw SHA-256, strict UTF-8/JSON and
Battle admission rules. Hashes use lowercase hex. Manifest keys are camelCase:
`protocolVersion`, `encoding`, `contentHash`, `compressedHash`, `compressedSize`,
`uncompressedSize`. Only version 1/gzip is accepted; unknown manifest fields fail.
Do not deserialize the whole Hub WorkResponse as a Manifest: extract these fields.

Limits: compressed 8 MiB, raw 32 MiB, JSON nesting bounded by serde_json's recursion
guard and at most 1,000,000 JSON values, 10,000 combined Battle/Creator entities,
250,000 combined timeline points, 10,000 events, hierarchy depth 64. Graph links
and descendant expansion are each bounded at 100,000; cumulative event graph
validation work is bounded at 2,000,000. Decode reads at most declared raw size + 1;
an attacker-controlled gzip ISIZE is never used to allocate memory.

Single gzip member only, no trailing bytes. Duplicate JSON keys (including escaped
equivalents) and trailing JSON values fail. This is deliberately stricter than the
Phase 0 Node experiment's JSON.parse/gunzip behavior. Empty/non-Battle documents fail.
Unknown extension fields and Creator data remain byte-identical when accepted.

Admission checks cover map dimensions/origin, finite coordinates, times and zoom,
IDs and references, hierarchy cycles including event mutations, force colors,
Creator v1/v2 state, group history and current nullable optional Creator numbers.
This is a sharing policy; it does not change legacy local import rules.

Image references in shared documents may use bundled `/maps/` or `/charas/` paths
without traversal, or PNG/JPEG/WebP data URLs with validated base64 and matching
file signatures. External HTTP(S), file, blob, SVG data URLs and encoded traversal
are rejected to prevent implicit network requests when a received document is
rendered. Existing local loading of external images is unchanged. Image decoding,
pixel-dimension limits, malware detection and content moderation are **not**
implemented here. Add image resource limits before exposing untrusted downloads
to the renderer. This validation is not a license or authorization decision.

## Cache contract

`Cache::open(app_owned_path, quota_bytes)` exclusively locks a private directory.
The path must come from the application, never a peer. Default budget constant is
256 MiB; the caller may set another budget, including zero. Quota includes the full
entry's manifest/header and gzip, including corrupt entries. A smaller budget never
silently deletes existing files. If existing bytes exceed it, new storage fails
until the user removes content or increases the budget.

Each `<contentHash>.bvp` is one container: `BVP2PC01` magic, little-endian u32
manifest length (1..1024), manifest JSON, then exact gzip bytes. Filenames must be
64 lowercase hex digits; no remote filename is accepted. Entries are validated
before staging, flushed, then atomically published without overwrite. A duplicate
is idempotent only for the same gzip. Different gzip representations of the same
raw hash conflict; future multiple-owner publication must resolve representation
selection rather than silently replacing a registered `compressedHash`.

An interrupted `.pending-*` regular file is removed on reopening after acquiring
the process lock. Unknown files, directories and symbolic links fail closed and
are never traversed/deleted. Corrupt entries are reported separately, never returned
as usable content, and can be explicitly removed. No automatic eviction can delete
an author's only copy. A maximum of 4096 entries bounds directory processing.
Both read methods revalidate content. Inventory performs full validation and must
run off the UI thread; add cancellation/progress when wiring Phase 2b.

`store` is an explicit local operation and grants no redistribution permission.
Phase 2b must gate replica storage/advertisement on persistent, explicit user consent
(default OFF). Downloads and consent to serve copies must remain separate actions.
The cache contains no account, token, peer address or authorization grant.

Threat boundary: the app owns this directory and cooperating writers use the lock.
This is not protection against another malicious process running as the same OS
user and racing filesystem calls. On Unix the containing directory is synced after
publication/removal. On Windows the payload is flushed before rename; sudden power
loss can still lose a recently published directory entry. Reopen validates whatever
survives; no durability across arbitrary hardware failure is promised.

## Run the checks

```sh
cargo test --manifest-path crates/battle-p2p-core/Cargo.toml --locked
cargo fmt --manifest-path crates/battle-p2p-core/Cargo.toml --check
cargo clippy --manifest-path crates/battle-p2p-core/Cargo.toml --locked --all-targets -- -D warnings
npm ci
node scripts/test-p2p-native-roundtrip.mjs
```

The integration script executes the real Rust encoder/cache/reopen path for all five
repository samples plus a Creator v2 fixture, compares exact bytes, calls the existing
TypeScript Viewer loader and Creator importer, and verifies hierarchy, group-toggle
history, unit interpolation and camera position/zoom interpolation. It uses temporary
local files and performs no HTTP/P2P transfer. CI runs native checks on Windows/Linux
alongside Rust 1.90 compatibility and existing Web and Linux Tauri package checks.

Manual local example (output must not exist):

```sh
cargo run --locked --manifest-path crates/battle-p2p-core/Cargo.toml --example roundtrip -- public/sample2-battle.json decoded.json private-cache
```

## Next phases and outstanding gates

2b: Tauri IPC, app-data path, persistent settings, identity, consent/privacy UI in
ja/en with keyboard/live status support. 3a: maintained libp2p encrypted bounded
direct transfer and peer retry. 3b: authenticated Hub discovery/leases, peer-bound
short-lived grants, fresh stop/entitlement checks before every transfer. 4: consented
replication target 3, re-replication, rate limits, source/all-offline states. 5: catalog,
publication and raw-byte Viewer/Creator handoff; Web fallback. 6: acceptance/security
and real external-network/NAT trials. No public relay, new service or paid contract
has been added; zero-cost always-online availability is not guaranteed.

Technical references: [flate2 single-member decoder](https://docs.rs/flate2/latest/flate2/bufread/struct.GzDecoder.html),
[tempfile persistence](https://docs.rs/tempfile/latest/tempfile/struct.NamedTempFile.html),
[fs2 file locking](https://docs.rs/fs2/latest/fs2/trait.FileExt.html).
