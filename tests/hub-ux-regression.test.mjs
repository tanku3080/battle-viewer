import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");

test("released Hub catalog contains only distributed works and no legacy section", () => {
  const page = read("app/hub/page.tsx");
  assert.doesNotMatch(page, /legacyTitle|legacyHint|getBattleHubBattles|downloadLegacyBattle/);
  assert.match(page, /<DistributedWorksPanel/);
  assert.match(page, /<P2pSettingsPanel/);
  assert.match(page, /<dialog/);
});
test("works preview does not navigate and uses BattlePlayer with seek/playback", () => {
  const catalog = read("components/p2p/DistributedWorksPanel.tsx");
  const preview = read("components/p2p/BattlePreviewDialog.tsx");
  assert.match(catalog, /open\(work, "preview"\)/);
  assert.match(preview, /<BattlePlayer/);
  assert.match(preview, /<TimelineBar/);
  assert.match(preview, /showModal/);
});
test("native search preserves Unicode by URL encoding and IME composition events", () => {
  const native = read("src-tauri/src/lib.rs");
  const catalog = read("components/p2p/DistributedWorksPanel.tsx");
  assert.match(native, /hub_search_works/);
  assert.match(native, /query_pairs_mut\(\)\.append_pair\("query", &query\)/);
  assert.match(catalog, /onCompositionEnd=/);
  assert.match(catalog, /p2p\.pasteSearch/);
});
test("initial consent persists enabled sharing; native IP discovery does not transmit datagram", () => {
  const terms = read("components/battleHub/HubConsentGate.tsx");
  const p2p = read("src-tauri/src/p2p/commands.rs");
  assert.match(terms, /participationEnabled: true/);
  assert.match(terms, /downloadsEnabled: true/);
  assert.match(terms, /redistributionEnabled: true/);
  assert.match(p2p, /UdpSocket::bind/);
  assert.match(p2p, /detect_local_ipv4/);
  assert.match(p2p, /request\.advertised_ip\.trim\(\)\.is_empty\(\)/);
});
