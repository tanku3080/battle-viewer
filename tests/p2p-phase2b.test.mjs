import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("Phase 2b keeps all P2P consent off by default", () => {
  const settings = read("src-tauri/src/p2p/settings.rs");
  assert.match(settings, /participation_enabled:\s*false/);
  assert.match(settings, /downloads_enabled:\s*false/);
  assert.match(settings, /redistribution_enabled:\s*false/);
  assert.match(settings, /DEFAULT_QUOTA_BYTES/);
  assert.match(settings, /DEFAULT_UPLOAD_LIMIT_BYTES_PER_SECOND/);
});

test("download and redistribution consent remain independent", () => {
  const settings = read("src-tauri/src/p2p/settings.rs");
  const ipc = read("src-tauri/src/p2p/mod.rs");
  const ui = read("components/p2p/P2pSettingsPanel.tsx");

  for (const field of [
    "participation_enabled",
    "downloads_enabled",
    "redistribution_enabled",
  ]) {
    assert.match(settings, new RegExp(field));
    assert.match(ipc, new RegExp(field));
  }

  assert.match(ui, /participationEnabled/);
  assert.match(ui, /downloadsEnabled/);
  assert.match(ui, /redistributionEnabled/);
  assert.match(ui, /p2p\.privacyIp/);
  assert.match(ui, /p2p\.privacyDisk/);
  assert.match(ui, /p2p\.privacyUpload/);
});

test("Phase 2b exposes settings and inventory IPC without starting networking", () => {
  const lib = read("src-tauri/src/lib.rs");
  const ipc = read("src-tauri/src/p2p/mod.rs");
  assert.match(lib, /p2p::p2p_get_status/);
  assert.match(lib, /p2p::p2p_update_settings/);
  assert.match(lib, /p2p::p2p_get_inventory/);
  assert.match(ipc, /spawn_blocking/);
  assert.match(ipc, /network_active:\s*false/);
  assert.doesNotMatch(lib, /p2p_fetch|p2p_download|p2p_start_network/);
});

test("installation identity never exposes the private seed through IPC", () => {
  const identity = read("src-tauri/src/p2p/identity.rs");
  const bridge = read("utils/tauri/bridge.ts");

  assert.match(identity, /identity_seed:\s*\[u8; 32\]/);
  assert.match(identity, /pub struct IdentityView/);
  assert.match(identity, /pub installation_id: String/);
  assert.doesNotMatch(
    identity.match(/pub struct IdentityView[\s\S]*?\n\}/)?.[0] ?? "",
    /seed/i
  );
  assert.doesNotMatch(bridge, /identitySeed/);
});

test("P2P data uses app-owned Tauri app data and private cache path", () => {
  const lib = read("src-tauri/src/lib.rs");
  const ipc = read("src-tauri/src/p2p/mod.rs");

  assert.match(lib, /app\.path\(\)\.app_data_dir\(\)/);
  assert.match(lib, /join\("p2p"\)/);
  assert.match(ipc, /root\.join\("cache"\)/);
  assert.match(ipc, /Cache::open/);
});

test("web UI clearly reports that P2P sharing requires Desktop", () => {
  const panel = read("components/p2p/P2pSettingsPanel.tsx");
  const home = read("app/home/page.tsx");

  assert.match(panel, /isTauriRuntime/);
  assert.match(panel, /p2p\.webOnly/);
  assert.match(home, /<P2pSettingsPanel/);
  assert.match(panel, /aria-labelledby="p2p-settings-title"/);
  assert.match(panel, /<fieldset/);
  assert.match(panel, /aria-live="polite"/);
});

test("native cache inventory is explicitly dispatched off the UI thread", () => {
  const ipc = read("src-tauri/src/p2p/mod.rs");
  const inventoryStart = ipc.indexOf("async fn inventory");
  const commandStart = ipc.indexOf("#[tauri::command]", inventoryStart);
  assert.ok(inventoryStart >= 0);
  const body = ipc.slice(inventoryStart, commandStart);
  assert.match(body, /spawn_blocking/);
  assert.match(body, /cache\s*\.inventory\(\)/);
});
