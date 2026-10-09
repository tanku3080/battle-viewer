import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src-tauri/src/lib.rs", "utf8");
const docs = readFileSync("docs/DEPLOYMENT_BRANCHES.md", "utf8");

test("debug defaults to localhost, release defaults to Render and permits env override", () => {
  assert.match(source, /#\[cfg\(debug_assertions\)\][\s\S]*?DEFAULT_HUB_URL: &str = "http:\/\/localhost:8080"/);
  assert.match(source, /#\[cfg\(not\(debug_assertions\)\)\][\s\S]*?DEFAULT_HUB_URL: &str = "https:\/\/battle-hub\.onrender\.com"/);
  assert.match(source, /std::env::var\("BATTLE_HUB_API_BASE_URL"\)/);
});

test("health probe precedes auth posts and rotated refresh is not blindly retried", () => {
  assert.match(source, /async fn wait_for_hub_ready/);
  assert.doesNotMatch(source, /send_hub_auth_with_retry/);
  const refresh = source.slice(source.indexOf("async fn refresh_access_token("),source.indexOf("pub(crate) async fn authenticated_request("));
  assert.ok(refresh.indexOf("wait_for_hub_ready(client).await?") < refresh.indexOf(".post(format!("), "refresh preflight first");
  const login = source.slice(source.indexOf("async fn auth_login("),source.indexOf("async fn auth_session("));
  assert.ok(login.indexOf("wait_for_hub_ready(&client)") < login.indexOf(".post(format!("), "login preflight first");
  assert.match(docs, /develop → staging → main/);
});
