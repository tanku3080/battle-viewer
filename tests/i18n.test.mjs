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


test("language switcher is menu-only and avoids native select rendering", () => {
  const switcher = fs.readFileSync(
    path.join(root, "components/i18n/LanguageSwitcher.tsx"),
    "utf8"
  );
  assert.doesNotMatch(switcher, /<select\b/);
  assert.match(switcher, /aria-pressed/);

  const home = fs.readFileSync(path.join(root, "app/home/page.tsx"), "utf8");
  assert.match(home, /LanguageSwitcher/);

  for (const relativePath of [
    "app/page.tsx",
    "app/battle/page.tsx",
    "app/create/page.tsx",
    "app/hub/page.tsx",
  ]) {
    const source = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert.doesNotMatch(source, /LanguageSwitcher/);
  }
});

test("default locale is Japanese and browser language does not override it", () => {
  const provider = fs.readFileSync(
    path.join(root, "i18n/I18nProvider.tsx"),
    "utf8"
  );
  assert.match(provider, /useState<Locale>\("ja"\)/);
  assert.doesNotMatch(provider, /navigator\.language/);
  assert.match(provider, /localStorage\.getItem\(STORAGE_KEY\)/);
});

test("Tauri starts in fullscreen mode", () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8")
  );
  assert.equal(config.app.windows[0].fullscreen, true);
});
