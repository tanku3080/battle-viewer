import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");

test("desktop release workflow targets both native installers", () => {
  const workflow = read(".github/workflows/build-desktop.yml");
  assert.match(workflow, /branches: \[develop\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /ubuntu-latest/);
  assert.match(workflow, /bundle: nsis/);
  assert.match(workflow, /bundle: deb/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
});

test("Battle Hub data component stays unmounted before first-visit agreement", () => {
  const gate = read("components/battleHub/HubConsentGate.tsx");
  const hub = read("app/hub/layout.tsx");
  assert.match(gate, /hasAcceptedHubTerms\(\)/);
  assert.match(gate, /disabled=\{!checked\}/);
  assert.match(gate, /router\.replace\("\/home"\)/);
  assert.match(gate, /acceptHubTerms\(\)/);
  assert.match(gate, /if \(accepted\) return/);
  assert.match(hub, /<HubConsentGate>/);
});

test("home navigation no longer pings Hub or presents P2P consent", () => {
  const access = read("components/battleHub/BattleHubAccessButton.tsx");
  const home = read("app/home/page.tsx");
  assert.doesNotMatch(access, /getBattleHubHealth/);
  assert.doesNotMatch(home, /P2pSettingsPanel/);
  assert.match(read("app/hub/page.tsx"), /P2pSettingsPanel/);
});

test("P2P background and Viewer requests are gated on first-visit agreement", () => {
  assert.match(read("components/p2p/P2pReplicationWorker.tsx"), /!hasAcceptedHubTerms\(\)/);
  assert.match(read("components/battle/controls/BattleHubControls.tsx"), /!hasAcceptedHubTerms\(\)/);
  const terms = read("utils/battleHub/terms.ts");
  assert.match(terms, /localStorage\.getItem/);
  assert.match(terms, /localStorage\.setItem/);
  assert.match(terms, /hub-terms-accepted/);
});
