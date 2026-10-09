import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const source = fs.readFileSync(path.join(process.cwd(), "utils/battleHub/validatePublish.ts"), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function("exports", js)(exports);
const { validatePublishBattle } = exports;

const valid = () => ({
  title: "Test Battle",
  map: { width: 1200, height: 800, coordinateOrigin: "center" },
  units: [{ id: "unit-1" }],
  timeline: { units: { "unit-1": [{ t: 0, x: 1, y: 2 }] }, camera: [{ t: 0, x: 0, y: 0, zoom: 1 }] },
});

test("valid Battle JSON passes preflight without mutation", () => {
  const input = valid();
  const original = JSON.stringify(input);
  assert.equal(validatePublishBattle(input).title, "Test Battle");
  assert.equal(JSON.stringify(input), original);
});

test("rejects invalid map, duplicate IDs and unknown links", () => {
  const noMap = valid();
  noMap.map.width = -2;
  assert.throws(() => validatePublishBattle(noMap), /map.width/);

  const duplicate = valid();
  duplicate.units.push({ id: "unit-1" });
  assert.throws(() => validatePublishBattle(duplicate), /duplicate id/);

  const broken = valid();
  broken.timeline.units.unknown = [{ t: 0, x: 0, y: 0 }];
  assert.throws(() => validatePublishBattle(broken), /Unknown unit timeline/);
});

test("rejects malformed timeline points and unsafe identifiers", () => {
  const invalid = valid();
  invalid.timeline.units["unit-1"][0].t = -5;
  assert.throws(() => validatePublishBattle(invalid), /timeline coordinates/);

  const unsafe = valid();
  unsafe.units[0].id = "__proto__";
  assert.throws(() => validatePublishBattle(unsafe), /invalid ID/);
});

test("rejects invalid force and accepts creator-style optional fields", () => {
  const invalid = valid();
  invalid.forces = [{ name: "Blue", color: "red" }];
  assert.throws(() => validatePublishBattle(invalid), /Invalid force/);

  const input = valid();
  input.creatorState = { version: 2, items: [] };
  input.forces = [{ name: "Blue", color: "#2563eb" }];
  assert.equal(validatePublishBattle(input).title, "Test Battle");
});
