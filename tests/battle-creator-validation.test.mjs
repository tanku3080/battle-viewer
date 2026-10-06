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

const validation = loadTs("utils/battleCreator/validation.ts");

function item(type, overrides = {}) {
  return {
    type,
    id: "",
    zoom: Number.NaN,
    ...overrides,
  };
}

test("creator validation: unit and hierarchy id are required", () => {
  assert.deepEqual(
    validation.getMissingRequiredFields(item("unit")),
    ["id"]
  );
  assert.deepEqual(
    validation.getMissingRequiredFields(item("regiment")),
    ["id"]
  );

  assert.equal(
    validation.hasMissingRequiredFields(item("unit", { id: "unit_1" })),
    false
  );
  assert.equal(
    validation.hasMissingRequiredFields(
      item("division", { id: "division_1" })
    ),
    false
  );
});

test("creator validation: character id is required", () => {
  assert.equal(
    validation.hasMissingRequiredFields(item("character")),
    true
  );
  assert.equal(
    validation.hasMissingRequiredFields(
      item("character", { id: "commander" })
    ),
    false
  );
});

test("creator validation: camera requires a finite zoom", () => {
  assert.deepEqual(
    validation.getMissingRequiredFields(item("camera")),
    ["zoom"]
  );
  assert.equal(
    validation.hasMissingRequiredFields(item("camera", { zoom: 1 })),
    false
  );
});
