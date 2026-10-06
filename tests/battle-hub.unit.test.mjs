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
      esModuleInterop: true,
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

const config = loadTs("utils/battleHub/config.ts");

test("Battle Hub API config defaults to local Spring Boot", () => {
  assert.equal(
    config.getBattleHubApiBaseUrl(undefined),
    "http://localhost:8080"
  );
});

test("Battle Hub API config trims trailing slash", () => {
  assert.equal(
    config.getBattleHubApiBaseUrl("https://hub.example.com/"),
    "https://hub.example.com"
  );
});
