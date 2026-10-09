import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
test("only catalog owns JSON publish dialog", () => {
  assert.doesNotMatch(source("app/hub/page.tsx"), /PublishWorkDialog|setPublishOpen/);
  assert.match(source("components/p2p/DistributedWorksPanel.tsx"), /<PublishWorkDialog/);
});
test("downloads display an accessible localized initiation notice", () => {
  const panel = source("components/p2p/DistributedWorksPanel.tsx");
  assert.match(panel, /setNotice\(t\("p2p\.downloadStarted", \{ title: work\.title \}\)\)/);
  assert.match(panel, /role="status" aria-live="polite"/);
  for(const locale of ["ja","en"]) assert.match(JSON.parse(source("i18n/locales/"+locale+".json"))["p2p.downloadStarted"], /\{title\}/);
});
