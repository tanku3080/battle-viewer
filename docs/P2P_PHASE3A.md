# Phase 3a: encrypted bounded direct transport

Status: implementation PR pending on `feat/p2p-phase3a-direct-transport`.

## Baseline

- FE baseline: `a83bcb88d2611ca6b43fa829d34f945cbb7987ee` (Phase 2b #46 merged).
- BE baseline checked: `5502070b44a213c54170b1df12d45ba4d0d3ecba`.
- Phase 2b merge-record cleanup is a separate docs-only PR #47 and is not a runtime dependency.

## Scope

Phase 3a adds a direct encrypted content transport foundation only.

Transport stack:

- libp2p 0.56 pinned
- TCP
- Noise authenticated encryption
- Yamux multiplexing
- request-response
- bounded CBOR codec

No DNS, mDNS, DHT, Relay, DCUtR or public bootstrap service is introduced in this phase.

## Identity

The existing Phase 2b private 32-byte installation identity seed is converted into a deterministic Ed25519 libp2p keypair.

Consequences:

- the same installation keeps the same PeerId across restarts
- the private seed remains local and is never returned through IPC
- the public PeerId may be displayed and later registered with Hub leases
- Phase 3b must reuse this PeerId rather than generate a replacement identity

## Wire protocol

Protocol name:

```text
/battle-viewer/content/1
```

Request:

- one lowercase SHA-256 content hash
- request codec maximum: 256 bytes

Response:

- found: Phase 2a manifest + the exact original gzip bytes
- not found
- denied
- unavailable

Response size is capped to the Phase 2a 8 MiB compressed-content ceiling plus a small bounded envelope allowance.

request-response configuration:

- request timeout: 5 seconds
- maximum concurrent inbound + outbound request streams: 8
- one active high-level fetch per DirectTransport actor
- alternate peer routes are tried sequentially after failure/rejection

The receiver checks the expected content hash and passes the returned manifest/gzip into Phase 2a `Cache::store`. The cache revalidates manifest, compressed/uncompressed hashes, sizes, gzip structure and Battle JSON before accepting it.

Downloaded bytes are never decompressed and re-gzipped for redistribution. B serves the exact gzip bytes it accepted from A.

## Authorization gate

Phase 3a intentionally does **not** expose a Tauri command such as “download by hash”.

Doing so before Phase 3b would create an anonymous hash-based retrieval path that bypasses Hub authorization.

The direct transport is therefore an internal Tauri module only. Production wiring waits for Phase 3b, where a fresh requester/provider/work-bound short-lived Hub grant must be checked before each transfer.

The loopback tests explicitly enable serving for test nodes. This is not a production authorization mechanism.

## Consent

The transport supports an allow-serving gate and tests that serving disabled returns denied.

Production start/listen/download/serve wiring is deferred until Phase 3b can combine the Phase 2b settings with fresh Hub authorization. In particular, no listener is automatically started by merging Phase 3a.

## Tests

Native Tauri Rust tests cover:

1. stable PeerId from stable seed
2. redistribution/serving denied when the serving gate is OFF
3. A stores original JSON/gzip
4. B fetches from A and retains the exact gzip
5. A can go conceptually out of the content path; C fetches the same content from replica B
6. C cache returns the original JSON bytes
7. an unreachable first route is retried against the next route

Existing Windows/Linux Tauri Rust CI compiles and runs these tests.

## Explicit non-goals

Still Phase 3b or later:

- Hub provider registration/discovery
- provider lease renewal/expiry
- short-lived transfer grants
- STOPPED/rights check per transfer
- public listener lifecycle tied to consent
- NAT traversal
- Circuit Relay v2
- DCUtR
- target-three replication
- automatic re-replication
- production upload bandwidth shaping
- user-facing download/play/re-edit integration
- untrusted image decode/pixel limits

Hub failure must remain fail-closed once the authorization layer is connected.
