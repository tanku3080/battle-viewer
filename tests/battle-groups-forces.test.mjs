import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTs } from "./helpers/load-ts.mjs";

const movement = loadTs("utils/battleCreator/movement.ts");
const { loadBattleJson } = loadTs("utils/battle/loadBattleJson.ts");
const { prepareFrameState } = loadTs("components/battle/BattlePlayer/runtime.ts");
const { getBattleDuration } = loadTs("utils/battle/getBattleDuration.ts");
const { validateForce } = loadTs("utils/battle/forces.ts");
const ForcePicker = loadTs("components/battle/ForcePicker.tsx").default;
const { I18nProvider } = loadTs("i18n/I18nProvider.tsx");

function renderWithI18n(element) {
  return renderToStaticMarkup(
    React.createElement(I18nProvider, null, element)
  );
}

function item(type, id, x = 0, y = 0, parentId = "", groupMove = false, t = 0) {
  return { type, id, key: id || crypto.randomUUID(), parentId, groupMove, x, y, appearAt: t, timeline: [{ t, x, y, explicit: false }] };
}
function attach(items, childId, parentId, t = 0) {
  return movement.syncCreatorGroupOrigins(items, items.map((entry) => entry.id === childId ? { ...entry, parentId } : entry), t);
}
function move(items, id, x, y, t) {
  return items.map((entry) => entry.id === id ? movement.recordCreatorPosition(entry, x, y, t) : entry);
}
function position(items, id, t) { return movement.getCreatorItemPositionAt(items, items.find((entry) => entry.id === id), t); }

test("group movement: follows parent path at playback and keeps offsets during editing at time zero", () => {
  let items = attach([item("regiment", "r", 0, 0, "", true), item("unit", "u", 10, 20)], "u", "r");
  items = move(items, "r", 20, -10, 0);
  assert.deepEqual(position(items, "u", 0), { x: 30, y: 10 });
  items = move(items, "r", 120, 90, 10);
  assert.deepEqual(position(items, "u", 5), { x: 80, y: 60 });
  assert.deepEqual(position(items, "u", 10), { x: 130, y: 110 });
});

test("nested enabled groups: outermost ancestor contributes displacement exactly once", () => {
  let items = [item("legion", "l", 0, 0, "", true), item("corps", "c", 10, 0, "l", true), item("division", "d", 20, 0, "c", true), item("regiment", "r", 30, 0, "d", true), item("unit", "u", 40, 0, "r")];
  items = movement.syncCreatorGroupOrigins(items.map((entry) => ({ ...entry, groupMove: false })), items, 0);
  items = move(items, "l", 100, 50, 5);
  for (const [id, offset] of [["c", 10], ["d", 20], ["r", 30], ["u", 40]]) {
    assert.deepEqual(position(items, id, 5), { x: 100 + offset, y: 50 });
  }
});

test("placement with a parent preselected captures the group origin before same-time edits", () => {
  const parent = item("regiment", "r", 10, 10, "", true);
  const child = movement.initializeCreatorGroupOrigin([parent], item("unit", "u", 30, 40, "r"));
  const items = move([parent, child], "r", 110, 60, 0);
  assert.deepEqual(position(items, "u", 0), { x: 130, y: 90 });
});

test("manual child paths take precedence and resume following after the last manual key", () => {
  let items = attach([item("regiment", "r", 0, 0, "", true), item("unit", "u", 10, 0)], "u", "r");
  items = move(items, "r", 100, 0, 10);
  items = move(items, "u", 50, 20, 3);
  items = move(items, "u", 70, 40, 7);
  assert.deepEqual(position(items, "u", 3), { x: 50, y: 20 });
  assert.deepEqual(position(items, "u", 5), { x: 60, y: 30 });
  assert.deepEqual(position(items, "u", 7), { x: 70, y: 40 });
  assert.deepEqual(position(items, "u", 10), { x: 100, y: 40 });
  items = move(items, "r", 300, 0, 10);
  assert.deepEqual(position(items, "u", 5), { x: 60, y: 30 });
  assert.deepEqual(position(items, "u", 7), { x: 70, y: 40 });
});

test("direct child coordinate at the same time as parent edit stays absolute", () => {
  let items = attach([item("regiment", "r", 0, 0, "", true), item("unit", "u", 10, 0)], "u", "r");
  items = move(items, "u", 50, 60, 0);
  items = move(items, "r", 200, 200, 0);
  assert.deepEqual(position(items, "u", 0), { x: 50, y: 60 });
});

test("empty IDs and invalid hierarchy types cannot establish a movement group", () => {
  const items = [item("regiment", "", 0, 0, "", true), item("unit", "u", 10, 20), item("character", "a", 40, 20, ""), item("camera", "cam", 0, 0)];
  assert.equal(movement.getCreatorGroupLeader(items, items[1]), null);
  assert.deepEqual(position(items, "u", 5), { x: 10, y: 20 });
  const malformed = [item("legion", "l", 0, 0, "", true), item("unit", "u", 10, 20, "l")];
  assert.equal(movement.getCreatorGroupLeader(malformed, malformed[1]), null);
});

test("turning a group off or detaching preserves current world coordinates", () => {
  let items = attach([item("regiment", "r", 0, 0, "", true), item("unit", "u", 10, 20)], "u", "r");
  items = move(items, "r", 100, 50, 10);
  const disabled = movement.syncCreatorGroupOrigins(items, items.map((entry) => entry.id === "r" ? { ...entry, groupMove: false } : entry), 5);
  assert.deepEqual(position(disabled, "u", 5), position(items, "u", 5));
  const detached = attach(items, "u", "", 5);
  assert.deepEqual(position(detached, "u", 5), position(items, "u", 5));
  assert.deepEqual(position(move(detached, "r", 300, 100, 10), "u", 10), position(detached, "u", 10));
});

test("group release at 6s preserves the 0-3s formation before three independent destinations", () => {
  let items = [item("regiment", "r", 0, 0, "", true), item("unit", "u1", 10, 20), item("unit", "u2", -20, 10), item("unit", "u3", 30, -10)];
  for (const id of ["u1", "u2", "u3"]) items = attach(items, id, "r");
  items = move(items, "r", 100, 50, 3);
  const expected = [0, 1.5, 3].map((t) => ["u1", "u2", "u3"].map((id) => position(items, id, t)));
  items = movement.setCreatorGroupMove(items, "r", false, 6);
  for (const [id, x, y] of [["u1", 200, 100], ["u2", 0, 100], ["u3", 150, -100]]) items = move(items, id, x, y, 6);
  for (const [index, t] of [0, 1.5, 3].entries()) {
    assert.deepEqual(["u1", "u2", "u3"].map((id) => position(items, id, t)), expected[index]);
  }
  assert.deepEqual(position(items, "u1", 4.5), { x: 155, y: 85 });
  assert.deepEqual(position(items, "u2", 4.5), { x: 40, y: 80 });
  assert.deepEqual(position(items, "u3", 4.5), { x: 140, y: -30 });
  for (const t of [6, 0, 3, 4.5, 0, 6]) {
    assert.equal(movement.getCreatorGroupMoveAt(items[0], t), t < 6);
  }
});

test("group switches preserve placement edits at zero and only follow enabled intervals", () => {
  let items = attach([item("regiment", "r"), item("unit", "u", 10, 0)], "u", "r");
  items = movement.setCreatorGroupMove(items, "r", true, 0);
  items = move(items, "r", 20, 0, 0);
  assert.deepEqual(position(items, "u", 0), { x: 30, y: 0 });
  for (const [t, x] of [[3, 120], [6, 120], [9, 180], [12, 240]]) items = move(items, "r", x, 0, t);
  items = movement.setCreatorGroupMove(items, "r", false, 6);
  items = movement.setCreatorGroupMove(items, "r", true, 9);
  for (const [t, x] of [[0, 30], [1.5, 80], [3, 130], [6, 130], [7.5, 130], [9, 130], [10.5, 160], [12, 190]]) {
    assert.deepEqual(position(items, "u", t), { x, y: 0 });
  }
  for (const [t, enabled] of [[0, true], [5.99, true], [6, false], [8.99, false], [9, true]]) {
    assert.equal(movement.getCreatorGroupMoveAt(items[0], t), enabled);
  }
});

test("editing an earlier switch removes stale inherited keys and preserves future manual destinations", () => {
  let items = attach([item("regiment", "r", 0, 0, "", true), item("unit", "u", 10, 0)], "u", "r");
  items = move(items, "r", 100, 0, 3);
  items = move(items, "r", 200, 0, 12);
  items = movement.setCreatorGroupMove(items, "r", false, 6);
  items = movement.setCreatorGroupMove(items, "r", true, 9);
  items = move(items, "u", 300, 50, 12);
  items = movement.setCreatorGroupMove(items, "r", false, 3);
  assert.deepEqual(position(items, "u", 0), { x: 10, y: 0 });
  assert.deepEqual(position(items, "u", 3), { x: 110, y: 0 });
  assert.deepEqual(position(items, "u", 12), { x: 300, y: 50 });
  assert.deepEqual(items[1].timeline.map((point) => point.t), [0, 3, 12]);
  assert.equal(items[1].timeline.at(-1).inherited, false);
});

test("disabling the outer group hands over to the next enabled ancestor without a jump", () => {
  let items = [item("legion", "l", 0, 0, "", true), item("corps", "c", 10, 0, "l", true), item("division", "d", 20, 0, "c"), item("regiment", "r", 30, 0, "d"), item("unit", "u", 40, 0, "r")];
  items = items.map((entry) => movement.initializeCreatorGroupOrigin(items, entry));
  items = move(items, "l", 100, 0, 3);
  items = move(items, "c", 150, 20, 3);
  items = move(items, "c", 210, 80, 9);
  const before = [0, 1.5, 3, 6].map((t) => position(items, "u", t));
  items = movement.setCreatorGroupMove(items, "l", false, 6);
  for (const [index, t] of [0, 1.5, 3, 6].entries()) assert.deepEqual(position(items, "u", t), before[index]);
  assert.equal(movement.getCreatorGroupLeader(items, items[4], 3).id, "l");
  assert.equal(movement.getCreatorGroupLeader(items, items[4], 6).id, "c");
  assert.deepEqual(position(items, "u", 7.5), { x: 155, y: 15 });
  assert.deepEqual(position(items, "u", 9), { x: 170, y: 30 });
});

test("late appearance begins at its specified position and export does not introduce an earlier key", () => {
  let items = attach([item("regiment", "r", 0, 0, "", true), item("unit", "u", 10, 20, "", false, 3)], "u", "r", 3);
  items = move(items, "r", 100, 0, 10);
  assert.deepEqual(position(items, "u", 3), { x: 10, y: 20 });
  const timeline = movement.buildCreatorWorldTimeline(items, items[1]);
  assert.equal(timeline[0].t, 3);
  assert.deepEqual(timeline.at(-1), { t: 10, x: 80, y: 20 });
});

test("X/Y arrows update the current-time keyframe and preserve previous points", () => {
  assert.equal(movement.stepCreatorCoordinate(-3, "ArrowUp"), -2);
  assert.equal(movement.stepCreatorCoordinate(0.5, "ArrowDown"), -0.5);
  assert.equal(movement.stepCreatorCoordinate("", "ArrowUp"), 1);
  assert.equal(movement.stepCreatorCoordinate(2, "ArrowLeft"), null);
  let unit = item("unit", "u", 0, 20);
  unit = movement.recordCreatorPosition(unit, movement.stepCreatorCoordinate(0, "ArrowUp"), 20, 3);
  assert.deepEqual(unit.timeline.map(({ t, x, y }) => ({ t, x, y })), [{ t: 0, x: 0, y: 20 }, { t: 3, x: 1, y: 20 }]);
});

test("exported group trajectories reproduce Creator and Viewer positions without applying groupMove twice", () => {
  let items = attach([item("regiment", "r", 0, 0, "", true), item("unit", "u", 10, 20)], "u", "r");
  items = move(items, "r", 100, 50, 10);
  items = move(items, "u", 40, 40, 5);
  const battle = loadBattleJson({ title: "Demo", map: { width: 200, height: 100, coordinateOrigin: "center" }, forces: [{ name: "Blue", color: "#123456" }], units: [{ id: "u", force: "Blue" }], hierarchy: { nodes: { r: { level: "regiment", groupMove: true, unitIds: ["u"] } } }, timeline: { units: { u: movement.buildCreatorWorldTimeline(items, items[1]) }, hierarchy: { r: movement.buildCreatorWorldTimeline(items, items[0]) } } });
  assert.equal(battle.units[0].color, "#123456");
  for (const t of [0, 2.5, 5, 7.5, 10]) {
    const frame = prepareFrameState(battle, t, 0.5);
    const expected = position(items, "u", t);
    assert.equal(frame.unitMap.u.transform.x, expected.x + 100);
    assert.equal(frame.unitMap.u.transform.y, 50 - expected.y);
    const parent = position(items, "r", t);
    assert.deepEqual(frame.hierarchy.nodes.r.position, { x: parent.x + 100, y: 50 - parent.y });
  }
  assert.equal(getBattleDuration(battle), 10);
});

test("released three-unit formation exports the complete history and replays identically after seeking", () => {
  let items = [item("regiment", "r", 0, 0, "", true), item("unit", "u1", 10, 20), item("unit", "u2", -20, 10), item("unit", "u3", 30, -10)];
  for (const id of ["u1", "u2", "u3"]) items = attach(items, id, "r");
  items = move(items, "r", 100, 50, 3);
  items = movement.setCreatorGroupMove(items, "r", false, 6);
  for (const [id, x, y] of [["u1", 200, 100], ["u2", 0, 100], ["u3", 150, -100]]) items = move(items, id, x, y, 6);
  items = move(items, "r", 300, 200, 9);
  const parent = items[0];
  const units = items.slice(1);
  const raw = {
    title: "Group release", map: { width: 800, height: 600, coordinateOrigin: "center" },
    units: units.map(({ id }) => ({ id })),
    hierarchy: { nodes: { r: { level: "regiment", groupMove: movement.getCreatorGroupMoveAt(parent, 0), groupMoveTimeline: parent.groupMoveTimeline, unitIds: units.map(({ id }) => id) } } },
    timeline: { units: Object.fromEntries(units.map((unit) => [unit.id, movement.buildCreatorWorldTimeline(items, unit)])), hierarchy: { r: movement.buildCreatorWorldTimeline(items, parent) } },
  };
  assert.deepEqual(raw.timeline.units.u1, [{ t: 0, x: 10, y: 20 }, { t: 3, x: 110, y: 70 }, { t: 6, x: 200, y: 100 }, { t: 9, x: 200, y: 100 }]);
  const battle = loadBattleJson(JSON.parse(JSON.stringify(raw)));
  assert.deepEqual(battle.hierarchy.nodes.r.groupMoveTimeline, [{ t: 6, enabled: false }]);
  for (const t of [9, 0, 6, 3, 0, ...Array.from({ length: 19 }, (_, index) => index / 2)]) {
    const frame = prepareFrameState(battle, t, 0.5);
    for (const unit of units) {
      const expected = position(items, unit.id, t);
      assert.ok(Math.abs(frame.unitMap[unit.id].transform.x - (expected.x + 400)) < 1e-9, `${unit.id} x at ${t}s`);
      assert.ok(Math.abs(frame.unitMap[unit.id].transform.y - (300 - expected.y)) < 1e-9, `${unit.id} y at ${t}s`);
    }
  }
  assert.equal(getBattleDuration(battle), 9);
});

test("group release does not introduce an appearance before a late unit's placement", () => {
  let items = attach([item("regiment", "r", 0, 0, "", true), item("unit", "u", 10, 20, "", false, 3)], "u", "r", 3);
  items = move(items, "r", 100, 0, 6);
  items = movement.setCreatorGroupMove(items, "r", false, 6);
  items = move(items, "u", 120, 50, 9);
  const timeline = movement.buildCreatorWorldTimeline(items, items[1]);
  assert.equal(timeline[0].t, 3);
  assert.deepEqual(timeline[0], { t: 3, x: 10, y: 20 });
  assert.deepEqual(position(items, "u", 6), { x: 60, y: 20 });
  assert.deepEqual(position(items, "u", 9), { x: 120, y: 50 });
});

test("force JSON uses catalog color and retains legacy per-unit colors when forces are absent", () => {
  const base = { title: "Demo", map: { width: 100, height: 100 }, units: [{ id: "u", force: "Blue", color: "#ff0000" }], timeline: { units: { u: [{ t: 0, x: 0, y: 0 }] } } };
  assert.equal(loadBattleJson(base).units[0].color, "#ff0000");
  assert.equal(loadBattleJson({ ...base, forces: [{ name: "Blue", color: "#123456" }] }).units[0].color, "#123456");
  assert.equal(loadBattleJson({ ...base, forces: [{ name: "Blue", color: "invalid" }] }).units[0].color, "#ff0000");
});

test("force validation rejects blanks, long names, duplicates and malformed colors", () => {
  const forces = [{ name: "Blue", color: "#123456" }];
  assert.ok(validateForce(" ", "#123456", forces));
  assert.ok(validateForce("x".repeat(65), "#123456", forces));
  assert.ok(validateForce(" blue ", "#123456", forces));
  assert.ok(validateForce("Red", "red", forces));
  assert.equal(validateForce("赤チーム", "#AA0000", forces), null);
});

test("force picker shows only creation when empty and registered names when available", () => {
  const props = { value: "", forces: [], loading: false, loadError: "", onRetry() {}, onChange() {}, async onCreate(force) { return force; } };
  const empty = renderWithI18n(React.createElement(ForcePicker, props));
  assert.ok(empty.includes("＋ 新しいforceを作成"));
  assert.ok(!empty.includes("<select"));
  const registered = renderWithI18n(React.createElement(ForcePicker, { ...props, value: "Blue", forces: [{ name: "Blue", color: "#123456" }] }));
  assert.ok(registered.includes("<select"));
  assert.ok(registered.includes("Blue"));
  assert.ok(registered.includes("#123456"));
});
