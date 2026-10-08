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

test("Tauri starts at normal size without native fullscreen and uses custom chrome", () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8")
  );
  const windowConfig = config.app.windows[0];
  assert.equal(windowConfig.maximized, false);
  assert.equal(windowConfig.width, 1280);
  assert.equal(windowConfig.height, 800);
  assert.equal(windowConfig.minWidth, 360);
  assert.equal(windowConfig.fullscreen, false);
  assert.equal(windowConfig.decorations, false);

  const chrome = fs.readFileSync(
    path.join(root, "components/tauri/TauriWindowChrome.tsx"),
    "utf8"
  );
  assert.match(chrome, /\.minimize\(\)/);
  assert.match(chrome, /\.toggleMaximize\(\)/);
  assert.match(chrome, /\.close\(\)/);
  assert.match(chrome, /data-tauri-drag-region/);

  const capabilities = JSON.parse(
    fs.readFileSync(
      path.join(root, "src-tauri/capabilities/default.json"),
      "utf8"
    )
  );
  for (const permission of [
    "core:window:allow-close",
    "core:window:allow-minimize",
    "core:window:allow-toggle-maximize",
    "core:window:allow-is-maximized",
    "core:window:allow-start-dragging",
  ]) {
    assert.ok(capabilities.permissions.includes(permission));
  }
});

test("viewer keeps native file chooser and modal dialogs available in maximized mode", () => {
  const battlePage = fs.readFileSync(
    path.join(root, "app/battle/page.tsx"),
    "utf8"
  );
  assert.match(battlePage, /type="file"/);

  const hubControls = fs.readFileSync(
    path.join(root, "components/battle/controls/BattleHubControls.tsx"),
    "utf8"
  );
  assert.match(hubControls, /<dialog/);
  assert.match(hubControls, /showModal\(\)/);

  const imagePicker = fs.readFileSync(
    path.join(root, "components/battle/ImageAssetPicker.tsx"),
    "utf8"
  );
  assert.match(imagePicker, /type="file"/);
  assert.match(imagePicker, /<dialog/);
  assert.match(imagePicker, /showModal\(\)/);
});


test("responsive layouts cover mobile, tablet, and desktop without fixed viewport width", () => {
  const battle = fs.readFileSync(path.join(root, "app/battle/page.tsx"), "utf8");
  assert.match(battle, /min-h-dvh/);
  assert.match(battle, /md:flex-row/);
  assert.doesNotMatch(battle, /w-screen/);
  assert.doesNotMatch(battle, /fixed bottom-0/);

  const creator = fs.readFileSync(path.join(root, "app/create/page.tsx"), "utf8");
  assert.match(creator, /lg:flex-row/);
  assert.match(creator, /w-full max-h-\[40dvh\]/);
  assert.match(creator, /lg:w-80/);

  const panel = fs.readFileSync(
    path.join(root, "components/battle/PanelContainer.tsx"),
    "utf8"
  );
  assert.match(panel, /w-full/);
  assert.match(panel, /md:w-\[260px\]/);
});

test("Tauri window tooltips are app-rendered and do not use native title attributes", () => {
  const chrome = fs.readFileSync(
    path.join(root, "components/tauri/TauriWindowChrome.tsx"),
    "utf8"
  );
  assert.match(chrome, /role="tooltip"/);
  assert.doesNotMatch(chrome, /title=\{/);
  assert.match(chrome, /group-hover:opacity-100/);
  assert.match(chrome, /group-focus-within:opacity-100/);
});
