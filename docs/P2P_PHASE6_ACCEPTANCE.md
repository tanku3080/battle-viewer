# Phase 6 – P2P integration, security and release acceptance

Source of truth: current FE/BE `develop` plus **unmerged** Phase6 branches.
Coordinated PRs: FE #50, BE #9. This document is not a claim of a full real-NAT test.

## Automated checks and evidence

| Scenario | Automated coverage | Required outcome |
| --- | --- | --- |
| A → B → C direct libp2p | `src-tauri/src/p2p/network.rs` Rust multi-peer loopback tests | Same original UTF-8 JSON, matching manifest/gzip, no re-encoding |
| Peer refuses serving | Native `consent_off_denies_serving` | Denied, never cached on receiver |
| Missing/unreachable peer | Native `retries_next_peer_route_after_failure` | Failed route retried |
| Forged compressed representation | Native `rejects_compressed_digest_mismatch_without_cache_write` | Hub `compressedHash` required before cache write |
| Raster header spoofing / corrupt PNG | Native image guard tests and `malformed_raster_is_neither_accepted_nor_served` | Denied before serve or cache write |
| Image resource traversal / tracking | Native `image_guard` tests | Remote URI, unsafe path, corrupt image denied, safe built-in path preserved |
| Auth/STOPPED/nonce replay | `P2pCoordinationIntegrationTest` (H2 & PostgreSQL profile) | 401/403, no anonymous grant or stopped work |
| Expired leases | `expiredProviderCannotBeDiscoveredOrDownloaded` | `downloadable=false`, zero online peers |
| Grant exhaustion | `grantIssuanceIsRateLimitedPerAccount` | HTTP 429 after bounded issuance |
| Grant and receipt TTL | `P2pCoordinationExpiryTest` with controllable clock | Transfer grant 20s; receipt 15min; neither replayable |
| Missing/null grant fields | `malformedMissingOrUnregisteredTokensNeverRaiseServerErrors` | No 500 or authorization bypass |
| Metadata-only Hub | Work API tests, migration schema | JSON body and bearer token not persisted in provider table |
| Creator imported state | Existing Creator and P2P content tests | `creatorState` extensions remain exact |
| FE app build | Consolidated `.github/workflows/ci.yml` | Node lint/test/build/static build; Windows Tauri Rust; Linux Debian |
| BE persistence | BE CI | H2 restarts and PostgreSQL migrations/API |

## Real multi-device and NAT manual acceptance (not replaceable with same-host CI)

No authorized remote desktop host is currently connected to run this physical test. It must be
marked **NOT TESTED** until at least 2 independent devices and preferably 3 on distinct networks
participate. Record actual logs/screenshots without bearer grants, local JSON content or tokens.

1. Build **both** branches and use a reachable Battle Hub and a firewall rule for the advertised
   P2P TCP listener. Use three independent installs A, B, C, each with a different PeerId.
2. On A: sign in, opt in to participation and upload sharing, start P2P, publish the original
   Battle JSON, check the metadata-only Hub list and reported provider count 1.
3. On B: sign in, opt in to download and redistribution, start P2P, open the published work
   in Viewer and Creator. Compare the exported JSON byte-for-byte and display against A;
   confirm original `creatorState` and embedded raster resources.
4. Confirm a verified B lease appears in Hub. Disconnect A completely; wait for lease expiry,
   then on C download via B. Verify count, content hash and exact gzip.
5. Stop all peers; after lease expiry the list must display zero online peers and no download
   action. STOPPED work must remain unavailable even while origin stays online.
6. Attempt unauthorized / expired / replayed grants, wrong PeerId/metadata digest, malformed
   image bytes, corrupt gzip and quota overflow; none may be served or rendered.
7. Repeat across (a) same LAN, (b) separate routed IPv4 networks, (c) both endpoints behind
   NAT with no port-forward, (d) endpoint(s) with explicitly configured inbound TCP forwarding.
   Record actual reachability and failure reason for each topology. **No automatic NAT traversal,
   relay or DHT exists**, so (c) is not expected to work without externally reachable routes.
8. Check Windows installer and Linux Debian launch, opt-in/off, Japanese and English, Creator,
   Viewer playback and accessibility. Verify no original JSON body is stored in Hub database.

## Security limits and known unfinished acceptance criteria

- The peer transfer uses encrypted libp2p TCP/Noise/Yamux. The native cache validates gzip,
  compressed and uncompressed size, UTF-8, both SHA-256 values, and schema.
- Before Phase6 PRs, an invalid embedded image could enter cache after a valid file signature.
  Phase6 validates decoded resources before cache admission **and** before sending cached bytes.
- The work distribution service limits active grants and receipts to 4096 each, grants to 60
  per account per minute, removes expired entries opportunistically, and separates grant 20s
  from post-transfer receipt 15min.
- Proven limitations: native upload rate is **configured but not yet strictly shaped on the
  libp2p wire**; the design currently uses a single CBOR response, not streaming chunks.
  The new rate-limited grant issuance is an API-abuse limit, not an upload throughput limiter.
- Direct peer addresses are supplied by authenticated users and are **not proof of public
  reachability or verified ownership of an advertised socket**. Provider listings are lease-based.
- The Hub currently has a single configured auth user, in-memory sessions, direct IPv4 peer
  addresses and no general NAT relay. The Hub must not be represented as a content host.
- Full release acceptance remains **BLOCKED** until strict upload shaping and physical NAT /
  three-device trials are completed, if these are mandatory requirements. Do not mark a phase
  as accepted merely because CI passes.
