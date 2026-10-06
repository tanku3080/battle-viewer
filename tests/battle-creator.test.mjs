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
