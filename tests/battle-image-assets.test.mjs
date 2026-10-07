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

const hierarchy = loadTs("utils/battle/hierarchy.ts");

test("hierarchy image: embedded data URL is preserved", () => {
  const icon = "data:image/png;base64,aGVsbG8=";
  const result = hierarchy.buildHierarchyNodesFromJson(
    {
      legions: [
        {
          id: "legion_a",
          name: "Legion A",
          icon,
          children: [],
        },
      ],
    },
    {}
  );

  assert.equal(result.nodes.legion_a.icon, icon);
});

test("hierarchy image: omitted icon remains null", () => {
  const result = hierarchy.buildHierarchyNodesFromJson(
    {
      legions: [
        {
          id: "legion_a",
          children: [],
        },
      ],
    },
    {}
  );

  assert.equal(result.nodes.legion_a.icon, null);
});
