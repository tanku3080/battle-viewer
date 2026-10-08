import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadTs } from "./helpers/load-ts.mjs";

const {
  importCreatorBattleJson,
  planCreatorForceSync,
} = loadTs("utils/battleCreator/importBattle.ts");

test("Creator import restores exact creatorState when present", () => {
  const raw = {
    title: "Resume Battle",
    map: {
      width: 1200,
      height: 700,
      coordinateOrigin: "center",
      image: "data:image/png;base64,abc",
    },
    units: [{ id: "u1", force: "Blue", color: "#112233" }],
    timeline: { units: { u1: [{ t: 0, x: 0, y: 0 }] } },
    forces: [{ name: "Blue", color: "#112233" }],
    creatorState: {
      version: 1,
      duration: 90,
      items: [
        {
          key: "unit-key",
          type: "unit",
          id: "u1",
          name: "Unit 1",
          description: "flavor",
          force: "Blue",
          color: "#112233",
          icon: "",
          parentId: "reg1",
          groupMove: false,
          x: 10,
          y: 20,
          zoom: null,
          dir: 0,
          appearAt: 3,
          destroyEnabled: true,
          destroyAt: 50,
          timeline: [
            { t: 3, x: 10, y: 20, explicit: false },
            { t: 10, x: 30, y: 40, explicit: true },
          ],
        },
      ],
    },
  };

  const imported = importCreatorBattleJson(raw);
  assert.equal(imported.title, "Resume Battle");
  assert.equal(imported.mapImage, "data:image/png;base64,abc");
  assert.equal(imported.duration, 90);
  assert.equal(imported.items.length, 1);
  assert.equal(imported.items[0].key, "unit-key");
  assert.equal(imported.items[0].description, "flavor");
  assert.equal(imported.items[0].parentId, "reg1");
  assert.equal(imported.items[0].destroyEnabled, true);
  assert.equal(imported.items[0].destroyAt, 50);
  assert.equal(imported.items[0].timeline[0].explicit, false);
  assert.equal(imported.items[0].timeline[1].explicit, true);
});

test("legacy Battle JSON import reconstructs regiment parent and center coordinates", () => {
  const raw = {
    title: "Legacy",
    map: { width: 1000, height: 600, coordinateOrigin: "center" },
    forces: [{ name: "Red", color: "#aa0000" }],
    hierarchy: {
      nodes: {
        reg1: {
          level: "regiment",
          name: "Regiment",
          unitIds: ["u1"],
          childrenIds: [],
          parentId: null,
          pos: { x: 20, y: 30 },
        },
      },
    },
    units: [{ id: "u1", force: "Red", color: "#aa0000" }],
    timeline: {
      units: {
        u1: [
          { t: 2, x: -100, y: 50 },
          { t: 8, x: 100, y: 75 },
        ],
      },
      hierarchy: {
        reg1: [{ t: 0, x: 20, y: 30 }],
      },
    },
  };

  const imported = importCreatorBattleJson(raw);
  const unit = imported.items.find((item) => item.type === "unit");
  const regiment = imported.items.find((item) => item.type === "regiment");

  assert.equal(unit.parentId, "reg1");
  assert.deepEqual(
    unit.timeline.map(({ t, x, y }) => ({ t, x, y })),
    [
      { t: 2, x: -100, y: 50 },
      { t: 8, x: 100, y: 75 },
    ]
  );
  assert.equal(regiment.x, 20);
  assert.equal(regiment.y, 30);
});

test("top-left Battle JSON is converted back to Creator center coordinates", () => {
  const raw = {
    title: "Top left",
    map: { width: 1000, height: 600, coordinateOrigin: "top-left" },
    units: [{ id: "u1" }],
    timeline: {
      units: {
        u1: [{ t: 0, x: 500, y: 300 }],
      },
    },
  };

  const imported = importCreatorBattleJson(raw);
  const unit = imported.items.find((item) => item.type === "unit");
  assert.equal(unit.timeline[0].x, 0);
  assert.equal(unit.timeline[0].y, 0);
});

test("force sync plan is case-insensitive and detects unresolved references", () => {
  const imported = importCreatorBattleJson({
    title: "Forces",
    map: { width: 100, height: 100, coordinateOrigin: "center" },
    forces: [
      { name: "Blue", color: "#0000ff" },
      { name: "Red", color: "#ff0000" },
    ],
    units: [
      { id: "u1", force: "blue" },
      { id: "u2", force: "Green" },
    ],
    timeline: { units: {} },
  });

  const plan = planCreatorForceSync(imported, [
    { name: "BLUE", color: "#123456" },
  ]);

  assert.deepEqual(
    plan.missingDefinitions.map((force) => force.name),
    ["Red"]
  );
  assert.deepEqual(plan.unresolvedForces, ["Green"]);
});


test("Creator page saves resume state and commits imported editor state only after force sync", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "app/create/page.tsx"),
    "utf8"
  );

  assert.match(source, /creatorState:\s*\{/);
  assert.match(source, /version:\s*1/);
  assert.match(source, /duration,/);
  assert.match(source, /items:\s*validItems\.map/);
  assert.match(source, /id="creator-json-import"/);
  assert.match(source, /creator\.importJson/);

  const parseIndex = source.indexOf("importCreatorBattleJson(parsed)");
  const forceIndex = source.indexOf("planCreatorForceSync(imported, registered)");
  const createIndex = source.indexOf("createBattleHubForce(definition)");
  const commitIndex = source.indexOf("setTitle(imported.title)");

  assert.ok(parseIndex >= 0);
  assert.ok(forceIndex > parseIndex);
  assert.ok(createIndex > forceIndex);
  assert.ok(commitIndex > createIndex);
});

test("Creator import refreshes force catalog after a successful sync", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "app/create/page.tsx"),
    "utf8"
  );
  const commitIndex = source.indexOf("setForces(synced)");
  const refreshIndex = source.indexOf(
    "setForceLoadVersion((version) => version + 1)",
    commitIndex
  );

  assert.ok(commitIndex >= 0);
  assert.ok(refreshIndex > commitIndex);
});
