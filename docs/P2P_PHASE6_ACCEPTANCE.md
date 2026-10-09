# Phase 6 – P2P integration, security and release acceptance

Source of truth: current FE/BE `develop` (Phase6 FE #50 and BE #9 merged)
plus the later FE upload-shaping branch. This is not a claim of full real-NAT
acceptance.

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
| Outbound payload bandwidth | Native `configured_upload_limit_shares_bandwidth_across_streams`, `PacedCodec` shared limiter, and Node source guards | Aggregate CBOR response payload writes paced in 4 KiB chunks at configured rate; encrypted TCP framing overhead excluded |
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
- The response codec now paces all outbound CBOR *application payload writes* on a
  shared 4 KiB reservation clock across concurrent libp2p responses. It reads the
  current configured upload limit (default 256 KiB/s; minimum 16 KiB/s) and no
  longer sends the entire response in one unbounded socket write. Its request
  timeout is 75 minutes to accommodate a fully-shared minimum-rate transfer of
  eight 8 MiB streams. CBOR remains one logical response and is not streamed as
  independent verified chunks. The limiter does **not** measure or strictly cap
  encrypted Noise/Yamux/TCP framing and retransmission overhead at the NIC.
  Bandwidth needs on-device measurement before the release is called wire-rate
  compliant. The Hub's separate rate limit on grant issuance is API-abuse
  prevention, not upload throughput limiting.
- Direct peer addresses are supplied by authenticated users and are **not proof of public
  reachability or verified ownership of an advertised socket**. Provider listings are lease-based.
- The Hub currently has a single configured auth user, in-memory sessions, direct IPv4 peer
  addresses and no general NAT relay. The Hub must not be represented as a content host.
- Full release acceptance remains **BLOCKED** until physical NAT / three-device
  trials and encrypted-wire throughput measurements are completed if those are
  mandatory requirements. Do not mark a phase as accepted merely because CI passes.
