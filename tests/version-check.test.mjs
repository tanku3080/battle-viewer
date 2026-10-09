import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("native update requests use public version endpoint and are wired", () => {
  const source = readFileSync("src-tauri/src/lib.rs", "utf8");
  assert.match(source, /async fn client_version\(/);
  assert.match(source, /\/api\/client\/version/);
  assert.match(source, /auth_register,/);
  assert.match(source, /client_version,/);
});
test("login route exposes account registration action", () => {
  const source = readFileSync("app/page.tsx", "utf8");
  assert.match(source, /register\.open/);
  assert.match(source, /RegisterDialog/);
});
