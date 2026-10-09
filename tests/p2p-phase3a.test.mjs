import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("Phase 3a uses encrypted bounded libp2p transport", () => {
  const cargo = read("src-tauri/Cargo.toml");
  const network = read("src-tauri/src/p2p/network.rs");

  assert.match(cargo, /libp2p = \{ version = "=0\.56\.0"/);
  for (const feature of ["noise", "yamux", "tcp", "tokio", "request-response", "cbor"]) {
    assert.match(cargo, new RegExp(`"${feature}"`));
  }

  assert.match(network, /MAX_COMPRESSED_SIZE \+ 16 \* 1024/);
  assert.match(network, /with_request_timeout\(REQUEST_TIMEOUT\)/);
  assert.match(network, /with_max_concurrent_streams\(MAX_CONCURRENT_STREAMS\)/);
  assert.match(network, /noise::Config::new/);
  assert.match(network, /yamux::Config::default/);
});

test("Phase 3a transport is not exposed as anonymous renderer download IPC", () => {
  const lib = read("src-tauri/src/lib.rs");
  const network = read("src-tauri/src/p2p/network.rs");
  const bridge = read("utils/tauri/bridge.ts");

  assert.match(lib, /p2p::commands::p2p_fetch/);
  assert.match(bridge, /desktopP2pFetch/);
  assert.match(network, /HubTransferAuthorizer/);
  assert.match(network, /auth\.check/);
  assert.match(network, /pub\(crate\) async fn spawn_direct_transport/);
});

test("Phase 3a derives public PeerId from the existing private installation seed", () => {
  const identity = read("src-tauri/src/p2p/identity.rs");
  const network = read("src-tauri/src/p2p/network.rs");
  const bridge = read("utils/tauri/bridge.ts");

  assert.match(identity, /keypair_from_seed\(&self\.identity_seed\)/);
  assert.match(network, /Keypair::ed25519_from_bytes/);
  assert.match(bridge, /peerId: string/);
  assert.doesNotMatch(bridge, /identitySeed/);
});

test("Phase 3a loopback tests cover consent denial retry and A-to-B-to-C", () => {
  const network = read("src-tauri/src/p2p/network.rs");

  assert.match(network, /async fn consent_off_denies_serving/);
  assert.match(network, /async fn a_to_b_to_c_preserves_exact_gzip_and_supports_replica_serving/);
  assert.match(network, /assert_eq!\(b_gzip, gzip\)/);
  assert.match(network, /assert_eq!\(c_gzip, gzip\)/);
  assert.match(network, /async fn retries_next_peer_route_after_failure/);
});

test("Phase 3a validates received content through the native cache before acceptance", () => {
  const network = read("src-tauri/src/p2p/network.rs");

  assert.match(network, /manifest\.content_hash != expected_hash/);
  assert.match(network, /cache\s*\.store\(&manifest, &gzip\)/);
  assert.match(network, /validate_hash\(&request\.content_hash\)/);
});

test("Phase 6 paces outgoing CBOR response bytes with a shared native upload limiter", () => {
  const network = read("src-tauri/src/p2p/network.rs");
  const cargo = read("src-tauri/Cargo.toml");

  assert.match(cargo, /async-trait = "0\\.1"/);
  assert.match(network, /struct UploadLimiter/);
  assert.match(network, /struct PacedCodec/);
  assert.match(network, /struct PacedWriter/);
  assert.match(network, /UPLOAD_CHUNK_BYTES: usize = 4 \* 1024/);
  assert.match(network, /PacedWriter::new\(io, Arc::clone\(&self\.limiter\)\)/);
  assert.match(network, /PacedCodec \{ inner: codec, limiter \}/);
  assert.match(network, /settings\.upload_limit_bytes_per_second/);
  assert.match(network, /configured_upload_limit_shares_bandwidth_across_streams/);
});
