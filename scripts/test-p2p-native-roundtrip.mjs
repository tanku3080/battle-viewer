// A real Rust gzip/cache/reopen -> existing TypeScript loaders integration test.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadTs } from "../tests/helpers/load-ts.mjs";

const { loadBattleJson } = loadTs("utils/battle/loadBattleJson.ts");
const { importCreatorBattleJson } = loadTs("utils/battleCreator/importBattle.ts");
const { getCreatorCameraAt } = loadTs("utils/battleCreator/timeline.ts");
const { getCreatorItemPositionAt } = loadTs("utils/battleCreator/movement.ts");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "battle-native-roundtrip-"));
const manifestPath = "crates/battle-p2p-core/Cargo.toml";

try {
  execFileSync("cargo", ["build", "--locked", "--manifest-path", manifestPath, "--example", "roundtrip"], { stdio: "inherit" });
  const executable = path.resolve("crates/battle-p2p-core/target/debug/examples/roundtrip" + (process.platform === "win32" ? ".exe" : ""));
  const frames = [
    { t: 0, x: 0, y: 0, explicit: false, inherited: false },
    { t: 10, x: 100, y: 50, explicit: true, inherited: false },
  ];
  const common = { name: "", description: "", force: "", color: "", icon: "", parentId: "", groupMove: false, x: 0, y: 0, zoom: null, dir: null, appearAt: 0, destroyEnabled: false, destroyAt: null, timeline: [] };
  const creator = {
    title: "Creator v2 native roundtrip / 日本語",
    map: { width: 1200, height: 700, coordinateOrigin: "center" },
    forces: [{ name: "Blue", color: "#112233" }],
    units: [{ id: "u1", name: "Unit", force: "Blue", color: "#112233" }],
    hierarchy: { nodes: { r1: { id: "r1", level: "regiment", name: "Regiment", parentId: null, childrenIds: [], unitIds: ["u1"], pos: { x: 0, y: 0 } } }, roots: ["r1"] },
    timeline: { units: { u1: frames }, hierarchy: { r1: [{ t: 0, x: 0, y: 0 }] }, camera: frames.map((frame, index) => ({ ...frame, zoom: index ? 3 : 1 })) },
    creatorState: {
      version: 2, coordinateOrigin: "center", duration: 10,
      items: [
        { ...common, key: "r1-key", type: "regiment", id: "r1", name: "Regiment", groupMove: true, groupMoveTimeline: [{ t: 0, enabled: true }, { t: 6, enabled: false }], timeline: [{ t: 0, x: 0, y: 0, explicit: false }] },
        { ...common, key: "u1-key", type: "unit", id: "u1", name: "Unit", parentId: "r1", force: "Blue", color: "#112233", timeline: frames },
        { ...common, key: "camera-key", type: "camera", id: "camera", zoom: 1, timeline: frames.map((frame, index) => ({ ...frame, zoom: index ? 3 : 1 })) },
      ],
    },
    extensionData: { mustRemain: ["unknown", "fields", 123] },
  };
  const fixture = path.join(temporary, "creator.json");
  fs.writeFileSync(fixture, JSON.stringify(creator, null, 2) + "\n");
  const samples = fs.readdirSync("public").filter((file) => /^sample.*\.json$/.test(file)).map((file) => path.resolve("public", file));
  for (const [index, input] of [...samples, fixture].entries()) {
    const output = path.join(temporary, `decoded-${index}.json`);
    execFileSync(executable, [input, output, path.join(temporary, "cache")], { stdio: "pipe" });
    assert.deepEqual(fs.readFileSync(output), fs.readFileSync(input), "native cache changed original bytes");
    const before = JSON.parse(fs.readFileSync(input, "utf8"));
    const after = JSON.parse(fs.readFileSync(output, "utf8"));
    assert.deepEqual(loadBattleJson(after), loadBattleJson(before));
    assert.deepEqual(importCreatorBattleJson(after), importCreatorBattleJson(before));
    if (input === fixture) {
      assert.deepEqual(after.creatorState, creator.creatorState);
      const imported = importCreatorBattleJson(after);
      const unit = imported.items.find((item) => item.type === "unit");
      const camera = imported.items.find((item) => item.type === "camera");
      assert.deepEqual(getCreatorItemPositionAt(imported.items, unit, 5), { x: 50, y: 25 });
      assert.deepEqual(getCreatorCameraAt(camera.timeline, 5, camera), { x: 50, y: 25, zoom: 2 });
      assert.deepEqual(imported.items[0].groupMoveTimeline, creator.creatorState.items[0].groupMoveTimeline);
    }
  }
  console.log(`Native gzip/cache/reopen -> Viewer + Creator: ${samples.length + 1} documents passed; v2 hierarchy, group history and interpolation preserved.`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
