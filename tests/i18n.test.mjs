import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const ja = JSON.parse(fs.readFileSync(path.join(root, "i18n/locales/ja.json"), "utf8"));
const en = JSON.parse(fs.readFileSync(path.join(root, "i18n/locales/en.json"), "utf8"));

test("i18n locale files expose the same message keys", () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ja).sort());
});

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function hasJapanese(text) {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(text);
}

test("React UI source has no hard-coded Japanese text outside locale files", () => {
  const files = ["app", "components"]
    .flatMap((dir) => walk(path.join(root, dir)))
    .filter((file) => /\.tsx?$/.test(file));

  const violations = [];

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const ast = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    function visit(node) {
      if (
        (ts.isStringLiteralLike(node) || ts.isJsxText(node)) &&
        hasJapanese(node.text)
      ) {
        const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
        violations.push(`${path.relative(root, file)}:${line}: ${node.text.trim()}`);
      }
      ts.forEachChild(node, visit);
    }

    visit(ast);
  }

  assert.deepEqual(violations, []);
});
