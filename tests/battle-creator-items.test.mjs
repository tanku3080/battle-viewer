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

const items = loadTs("utils/battleCreator/items.ts");

test("creator item: default name uses the current same-type count", () => {
  const existing = [
    { type: "unit" },
    { type: "regiment" },
    { type: "unit" },
  ];

  assert.equal(items.getCreatorDefaultName("unit", existing), "unit3");
  assert.equal(
    items.getCreatorDefaultName("regiment", existing),
    "regiment2"
  );
  assert.equal(items.getCreatorDefaultName("camera", existing), "camera1");

  for (const type of [
    "character",
    "legion",
    "corps",
    "division",
  ]) {
    assert.equal(items.getCreatorDefaultName(type, []), `${type}1`);
  }
});

test("creator item: display name prioritizes name over id", () => {
  assert.equal(
    items.getCreatorDisplayName({
      type: "unit",
      id: "unit_id",
      name: "unit1",
    }),
    "unit1"
  );
  assert.equal(
    items.getCreatorDisplayName({
      type: "division",
      id: "division_id",
      name: "",
    }),
    "division_id"
  );
});
