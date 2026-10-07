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

const hierarchy = loadTs("utils/battleCreator/hierarchy.ts");

test("creator hierarchy: only military order is accepted", () => {
  assert.equal(hierarchy.canCreatorParent("corps", "legion"), true);
  assert.equal(hierarchy.canCreatorParent("division", "corps"), true);
  assert.equal(hierarchy.canCreatorParent("regiment", "division"), true);
  assert.equal(hierarchy.canCreatorParent("unit", "regiment"), true);
});

test("creator hierarchy: invalid nesting is rejected", () => {
  assert.equal(hierarchy.canCreatorParent("unit", "unit"), false);
  assert.equal(hierarchy.canCreatorParent("division", "regiment"), false);
  assert.equal(hierarchy.canCreatorParent("legion", "corps"), false);
  assert.equal(hierarchy.canCreatorParent("character", "legion"), false);
});

test("creator hierarchy: legion and character remain battle-root only", () => {
  assert.equal(hierarchy.isCreatorBattleRootOnly("legion"), true);
  assert.equal(hierarchy.isCreatorBattleRootOnly("character"), true);
  assert.equal(hierarchy.isCreatorBattleRootOnly("unit"), false);
});
