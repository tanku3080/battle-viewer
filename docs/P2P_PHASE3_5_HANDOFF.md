# Phase 3–5 P2P platform integration

## Branches / pull requests

- FE: `feat/p2p-phase3-5-platform`, PR #49 → `develop`
- BE: `feat/p2p-phase3-5-platform`, PR #8 → `develop`
- GitHub PRs cannot include two repositories; these two coordinated PRs are a single feature release.
- Both PRs are draft until CI and cross-repository integration are verified. **Do not merge automatically.**
- FE baseline `87432c86cb1347becb1a2b0feeec59f9ceffc551`
- BE baseline `5502070b44a213c54170b1df12d45ba4d0d3ecba`

## Protocol / authorization

- Origin editor saves exact raw UTF-8 bytes and gzip plus dual SHA-256 to the local native cache.
- Hub stores metadata, not JSON bytes.
- Authenticated origin registers its PeerId and short-lived provider lease.
- Addresses and grants exist only in Hub process memory (not persisted); lease metadata is DB-backed.
- New download requests require an authenticated requester/provider/work-bound short-lived grant.
- Noise handshake supplies the actual observed remote PeerId at provider; caller-provided PeerId alone is never trusted.
- Provider calls Hub `/api/v2/works/{workId}/peers/check` to consume grant, verify work ACTIVE, contentHash, observed requester PeerId, provider PeerId, owner and live lease.
- Hub outage, revoked session, STOPPED, mismatched hash/PeerId, missing lease or expired grant deny transfer.
- Recipient sends verified raw gzip through the original Phase2a Cache validator. Recipient can register as replica with one-time receipt only if redistribution consent is enabled.
- Every new transfer needs a new grant. Authorizations are not indefinite session capabilities.

## Native runtime / consent

- Participation, download permission and redistribution permission are independent opt-ins, default OFF.
- P2P starts only when manually requested by Desktop user; no unsolicited public listener.
- Explicit advertised IPv4 supplied by user. Binds `0.0.0.0:0` TCP, libp2p Noise, Yamux.
- HTTP metadata and grant requests use the existing authenticated Rust Hub client, including refresh semantics.
- The network is stopped on logout or when the master participation consent is revoked.
- A lease renewal worker checks active references every 25 seconds while the app runs.
- Work references persist locally, raw JSON bytes stay in native cache.
- Web shows catalog metadata only; it cannot act as a P2P provider.
- Desktop UI can publish a local JSON, open authorized content directly in Viewer, or import it into Creator's editable state.
- The transient raw JSON handoff uses in-memory Next.js module state, not browser storage.
- PNG/JPEG/WebP Data URL images are actually decoded and subject to bounded dimensions, bytes and total pixel budget before untrusted content reaches the renderer.

## Replication and availability

- Hub work responses count live providers with unexpired lease and in-memory reachable address.
- STOPPED and zero providers are not marked downloadable.
- Desktop renderer checks under-replicated catalog content at most once a minute, and makes at most two best-effort downloads per iteration only when participation, downloads and redistribution all remain ON.
- This is voluntary best effort, NOT guaranteed third-copy availability, headless background service or NAT traversal.
- Offline leases expire. Hub reconnect may be required after restart.
- Cache has no automatic eviction and enforces configured quota before accepting bytes.

## Deployment / limits

- DB file/PostgreSQL is separate from bootstrap/discovery and Relay cost.
- No paid relay/bootstrap contract or payments/ads are introduced.
- Direct TCP on publicly reachable or LAN addresses works; NAT traversal, Relay v2, DHT/bootstrap and Internet-wide availability are not guaranteed.
- Upload rate preference is persisted but strict per-stream bandwidth shaping is not yet implemented; treat it as a remaining acceptance criterion, not implemented.
- No full independent multi-device NAT trial has been performed.
- Auth sessions and authorization grants must never be logged, stored in JSON or persisted in the Hub catalog.
- The local Tauri image decoder enforces 4096x4096 per asset, 16 MP per image, 32 MP aggregate, max 10 MiB encoded bytes per asset and max 2048 assets.
- Full Phase6 adversarial/E2E security and multi-device acceptance test remains a separate release gate.

## CI

FE CI consolidated from six jobs to three: one Linux frontend + core verification, one Windows native test/clippy, and one Linux Tauri Debian package build. BE retains its H2 + PostgreSQL integration. PRs must remain unmerged until green.
