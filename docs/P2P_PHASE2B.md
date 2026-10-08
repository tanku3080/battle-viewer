# Phase 2b: Tauri P2P settings, identity and cache IPC

Status: merged in FE PR #46.

- PR head: `2a87e7f4b14c6088008a1ea625d17c271f263c40`
- merge commit: `a83bcb88d2611ca6b43fa829d34f945cbb7987ee`
- final CI run: `37749964084` — success
- merged: 2026-10-08

## Baseline

- Battle Viewer develop at branch creation: `fe61a69afacaf3df3deb755d16c9d08201dca6ac` (Phase 2a #45 merged).
- Battle Hub develop verified: `5502070b44a213c54170b1df12d45ba4d0d3ecba` (Phase 1 #7 merged).
- Phase 0 #44, Phase 1 #7 and Phase 2a #45 were all merged before this phase. No cherry-pick dependency is required.
- Current source code remains authoritative over older design documents.

## Scope

Phase 2b wires the Phase 2a native content/cache library into the Tauri application and establishes the persistent local consent boundary. It deliberately does **not** start a listener, connect to a peer, advertise an address, download content or upload content.

Network transport, Hub provider discovery and transfer grants remain Phase 3 work.

## App-owned storage

Tauri resolves its own `app_data_dir` and creates:

```text
<app_data_dir>/p2p/
  settings.json
  identity.json
  cache/
    .lock
    <contentHash>.bvp
```

The renderer cannot choose these filesystem paths.

On Unix the P2P directory is restricted to mode `0700`; settings and identity files are restricted to `0600`. On Windows these files live under the application's user-scoped app-data directory and use the account ACL inherited from that directory. This is not an OS credential vault and does not protect against a malicious process already running as the same OS user.

The Phase 2a cache lock is acquired before identity creation, so a second cooperating Battle Viewer process fails closed before it can race identity persistence.

## Persistent settings

Settings schema version 1:

```json
{
  "version": 1,
  "participationEnabled": false,
  "downloadsEnabled": false,
  "redistributionEnabled": false,
  "cacheQuotaBytes": 268435456,
  "uploadLimitBytesPerSecond": 262144
}
```

All participation and transfer consents are opt-in and default OFF.

The three booleans are intentionally separate:

- `participationEnabled`: master preference to participate in the future P2P subsystem.
- `downloadsEnabled`: consent to connect to authorized peers to receive content.
- `redistributionEnabled`: separate consent to upload cached content to authorized peers.

Phase 2b persists these choices only. It does not start network activity even when they are ON.

Cache quota:

- default: 256 MiB
- accepted range: 0 through 64 GiB
- reducing below current cache usage fails; existing content is not evicted automatically

Upload limit:

- default: 256 KiB/s
- accepted range: 16 KiB/s through 64 MiB/s
- stored now for Phase 3/4 enforcement

Settings are staged to a temporary file, flushed and published. Invalid settings do not replace the last valid settings.

## Installation identity

Each installation gets:

- a random UUIDv4-compatible installation ID for UI/support visibility
- a random 32-byte private identity seed reserved for future peer identity derivation

The private seed is persisted locally but is **never returned through Tauri IPC and never displayed in the renderer**. Phase 3 must derive the network identity from this existing seed rather than silently replacing the installation identity.

The installation ID is not a promise that one ID equals one physical computer.

## Tauri IPC

Commands registered by Phase 2b:

- `p2p_get_status`
- `p2p_update_settings`
- `p2p_get_inventory`

Status returns:

- availability / initialization error
- settings
- public installation ID
- cache used bytes
- `networkActive: false`

Inventory returns only verified cache metadata/hashes/sizes and corrupt hashes. It never returns cached Battle JSON bytes through this settings API.

`Cache::inventory()` performs full validation and therefore runs in `tauri::async_runtime::spawn_blocking`, not on the UI thread.

## Consent and privacy UI

The Home screen contains an accessible P2P settings panel in Japanese and English.

The desktop UI explicitly states:

- an authorized P2P peer may see the user's IP address during a connection
- cache/replication can consume local disk space
- redistribution can consume upload bandwidth
- download consent and redistribution consent are different choices
- Phase 2b does not yet start networking

Web does not emulate desktop P2P. It explicitly says P2P sharing requires Battle Viewer Desktop while existing local JSON import and metadata-oriented flows remain available.

## Failure behavior

P2P initialization failure does not prevent Battle Viewer itself from launching. The P2P panel reports the initialization error and remains unavailable.

The cache remains fail-closed under Phase 2a validation and quota rules. Lowering quota does not evict data. Corrupt entries are reported but not exposed as usable content.

No Hub token, peer address or transfer authorization grant is persisted in this local cache/settings layer.

## CI and tests

Phase 2b extends CI with:

- deterministic Tauri `Cargo.lock` regeneration check
- Tauri Rust tests on Windows
- Tauri Rust tests before Linux Debian packaging
- Tauri clippy with warnings denied on Windows
- existing Phase 2a Windows/Linux native-core tests
- existing Rust 1.90 core MSRV check
- FE lint/unit/Web/static-Tauri builds
- source regression tests for consent separation, private identity boundary, app-owned paths, Web fallback and blocking inventory

Final verification was completed before merge: PR head `2a87e7f4b14c6088008a1ea625d17c271f263c40`, CI run `37749964084` succeeded, and the merge commit is `a83bcb88d2611ca6b43fa829d34f945cbb7987ee`.

## Explicit non-goals / next gates

Phase 2b does not implement:

- libp2p
- a network listener
- peer discovery
- Hub provider lease
- transfer authorization grants
- content download/upload
- target-three replication
- NAT traversal or public relay
- rendering untrusted downloaded images

Before Phase 5 passes downloaded documents to Viewer/Creator rendering, image decoding and pixel/resource limits remain a mandatory security gate.

Phase 3 should be split into:

1. Phase 3a: bounded encrypted direct transport, timeout/retry and loopback A→B→C tests.
2. Phase 3b: authenticated Hub provider discovery, expiring leases and requester/provider-bound short-lived grants with fresh STOPPED/rights checks before every transfer.

Hub-unavailable transfer authorization must fail closed. Anonymous content-hash retrieval must not be introduced.
