import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

function loadTs(relativePath) {
  const filename = path.join(process.cwd(), relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;

  const compiledModule = { exports: {} };
  const execute = new Function(
    "exports",
    "module",
    "require",
    "__filename",
    "__dirname",
    output
  );

  execute(
    compiledModule.exports,
    compiledModule,
    () => {
      throw new Error("Unexpected runtime import");
    },
    filename,
    path.dirname(filename)
  );

  return compiledModule.exports;
}

const timeline = loadTs("utils/battleCreator/timeline.ts");

test("creator seek: returns initial position again after seeking back to zero", () => {
  const points = [
    { t: 0, x: -100, y: 50 },
    { t: 3, x: 200, y: 150 },
  ];

  assert.deepEqual(
    timeline.getCreatorPositionAt(points, 3, { x: 0, y: 0 }),
    { x: 200, y: 150 }
  );
  assert.deepEqual(
    timeline.getCreatorPositionAt(points, 0, { x: 0, y: 0 }),
    { x: -100, y: 50 }
  );
});

test("creator playback: interpolates between keyframes", () => {
  const result = timeline.getCreatorPositionAt(
    [
      { t: 0, x: 0, y: 0 },
      { t: 4, x: 40, y: 80 },
    ],
    2,
    { x: 0, y: 0 }
  );

  assert.deepEqual(result, { x: 20, y: 40 });
});

test("creator timeline: clamps before first and after last keyframe", () => {
  const points = [
    { t: 1, x: 10, y: 20 },
    { t: 3, x: 30, y: 40 },
  ];

  assert.deepEqual(
    timeline.getCreatorPositionAt(points, 0, { x: 999, y: 999 }),
    { x: 10, y: 20 }
  );
  assert.deepEqual(
    timeline.getCreatorPositionAt(points, 10, { x: 999, y: 999 }),
    { x: 30, y: 40 }
  );
});


test("creator visibility: element placed at 3s does not exist before 3s", () => {
  const points = [{ t: 3, x: 10, y: 20 }];

  assert.equal(
    timeline.isCreatorElementVisibleAt({
      timeline: points,
      appearAt: 3,
      destroyEnabled: false,
      destroyAt: Number.NaN,
      t: 0,
    }),
    false
  );
  assert.equal(
    timeline.isCreatorElementVisibleAt({
      timeline: points,
      appearAt: 3,
      destroyEnabled: false,
      destroyAt: Number.NaN,
      t: 3,
    }),
    true
  );
});

test("creator visibility: destruction fades out over 0.5 seconds", () => {
  const points = [
    { t: 0, x: 0, y: 0 },
    { t: 5, x: 50, y: 50 },
  ];

  const atDestroy = timeline.getCreatorElementVisualState({
    timeline: points,
    appearAt: 0,
    destroyEnabled: true,
    destroyAt: 4,
    t: 4,
    fadeDuration: 0.5,
  });
  assert.equal(atDestroy.visible, true);
  assert.equal(atDestroy.alpha, 1);
  assert.equal(atDestroy.scale, 1);

  const halfway = timeline.getCreatorElementVisualState({
    timeline: points,
    appearAt: 0,
    destroyEnabled: true,
    destroyAt: 4,
    t: 4.25,
    fadeDuration: 0.5,
  });
  assert.equal(halfway.visible, true);
  assert.ok(Math.abs(halfway.alpha - 0.5) < 1e-9);
  assert.ok(Math.abs(halfway.scale - 0.6) < 1e-9);

  const completed = timeline.getCreatorElementVisualState({
    timeline: points,
    appearAt: 0,
    destroyEnabled: true,
    destroyAt: 4,
    t: 4.5,
    fadeDuration: 0.5,
  });
  assert.equal(completed.visible, false);
  assert.equal(completed.alpha, 0);
  assert.equal(completed.scale, 0);
});

test("creator editing: placed element is full-size at its appearance time", () => {
  const points = [{ t: 3, x: 10, y: 20 }];

  assert.deepEqual(
    timeline.getCreatorElementVisualState({
      timeline: points,
      appearAt: 3,
      destroyEnabled: false,
      destroyAt: Number.NaN,
      t: 3,
      fadeDuration: 0.5,
      animateTransitions: false,
    }),
    { visible: true, alpha: 1, scale: 1 }
  );

  assert.deepEqual(
    timeline.getCreatorElementVisualState({
      timeline: points,
      appearAt: 3,
      destroyEnabled: false,
      destroyAt: Number.NaN,
      t: 0,
      fadeDuration: 0.5,
      animateTransitions: false,
    }),
    { visible: false, alpha: 0, scale: 0 }
  );
});

test("creator playback: appearance keeps the fade-in animation", () => {
  const points = [{ t: 3, x: 10, y: 20 }];

  assert.deepEqual(
    timeline.getCreatorElementVisualState({
      timeline: points,
      appearAt: 3,
      destroyEnabled: false,
      destroyAt: Number.NaN,
      t: 3,
      fadeDuration: 0.5,
      animateTransitions: true,
    }),
    { visible: true, alpha: 0, scale: 0.2 }
  );
});

test("creator editing: destroyed element hides without a partial fade state", () => {
  assert.deepEqual(
    timeline.getCreatorElementVisualState({
      timeline: [{ t: 0, x: 0, y: 0 }],
      appearAt: 0,
      destroyEnabled: true,
      destroyAt: 4,
      t: 4.25,
      fadeDuration: 0.5,
      animateTransitions: false,
    }),
    { visible: false, alpha: 0, scale: 0 }
  );
});

test("creator visibility: hierarchy can use explicit appearance time without timeline", () => {
  assert.equal(
    timeline.isCreatorElementVisibleAt({
      timeline: [],
      appearAt: 5,
      destroyEnabled: false,
      destroyAt: Number.NaN,
      t: 4.9,
    }),
    false
  );
  assert.equal(
    timeline.isCreatorElementVisibleAt({
      timeline: [],
      appearAt: 5,
      destroyEnabled: false,
      destroyAt: Number.NaN,
      t: 5,
    }),
    true
  );
});


test("creator camera: position and zoom interpolate together", () => {
  const camera = timeline.getCreatorCameraAt(
    [
      { t: 0, x: 0, y: 0, zoom: 1 },
      { t: 4, x: 40, y: 80, zoom: 2 },
    ],
    2,
    { x: 0, y: 0, zoom: 1 }
  );

  assert.deepEqual(camera, {
    x: 20,
    y: 40,
    zoom: 1.5,
  });
});
