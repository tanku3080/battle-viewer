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
  const preview = fs.readFileSync(path.join(root, "components/p2p/BattlePreviewDialog.tsx"), "utf8");
  assert.match(preview, /<dialog/);
  assert.match(preview, /showModal\(\)/);

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


test("mobile viewer uses touch gestures instead of an on-screen dpad", () => {
  const player = fs.readFileSync(
    path.join(root, "components/battle/BattlePlayer/BattlePlayer.tsx"),
    "utf8"
  );

  assert.match(player, /onPointerDown=/);
  assert.match(player, /onPointerMove=/);
  assert.match(player, /onPointerUp=/);
  assert.match(player, /touch-none/);
  assert.match(player, /getPointerDistance/);
  assert.doesNotMatch(player, /canvas\.controls/);
  assert.doesNotMatch(player, /bottom-3 left-3 grid grid-cols-3/);
});

test("Viewer displays one accessible Battle Hub entry", () => {
  const controls = fs.readFileSync(path.join(root, "components/battle/controls/BattleHubControls.tsx"), "utf8");
  assert.match(controls, /<BattleHubAccessButton/);
  assert.doesNotMatch(controls, /desktopPanelOpen/);
  const home = fs.readFileSync(path.join(root, "app/home/page.tsx"), "utf8");
  assert.match(home, /hidden lg:block/);
});

test("viewer keeps legacy desktop toolbar while mobile/tablet use priority layout", () => {
  const battle = fs.readFileSync(path.join(root, "app/battle/page.tsx"), "utf8");

  const desktopStart = battle.indexOf('className="hidden min-w-0 flex-wrap items-center gap-2 p-3 lg:flex');
  const mobileStart = battle.indexOf('className="grid gap-2 p-2 sm:p-3 lg:hidden"');
  assert.ok(desktopStart >= 0 && mobileStart > desktopStart);

  const desktop = battle.slice(desktopStart, mobileStart);
  assert.ok(desktop.indexOf('t("battle.loadJson")') < desktop.indexOf('t("battle.back")'));
  assert.ok(desktop.includes("currentTime={currentTime}"));
  assert.ok(desktop.includes("showGrid={showGrid}"));

  const mobile = battle.slice(mobileStart);
  const back = mobile.indexOf('t("battle.back")');
  const grid = mobile.indexOf('t("view.grid")');
  const load = mobile.indexOf('t("battle.loadJson")');
  const publish = mobile.indexOf("<BattleHubControls");
  const playback = mobile.indexOf("<PlaybackControls");
  const viewModes = mobile.indexOf("<ViewModeButtons");
  const production = mobile.indexOf("<ProductionButton");
  const current = mobile.indexOf('t("playback.current"');

  assert.ok(back >= 0 && grid > back);
  assert.ok(load > grid && publish > load);
  assert.ok(playback > publish && viewModes > playback && production > viewModes);
  assert.ok(current > production);
});

test("selected details do not expose icon path or base64 metadata", () => {
  const panel = fs.readFileSync(
    path.join(root, "components/SelectedInfoPanel.tsx"),
    "utf8"
  );
  assert.doesNotMatch(panel, /selected\.iconPath/);
  assert.doesNotMatch(panel, /iconPath \?\? t\("common\.none"\)/);
  assert.equal("selected.iconPath" in ja, false);
  assert.equal("selected.iconPath" in en, false);
});


test("Creator desktop layout keeps the legacy three-column structure", () => {
  const creator = fs.readFileSync(path.join(root, "app/create/page.tsx"), "utf8");
  assert.match(creator, /lg:h-screen/);
  assert.match(creator, /lg:h-16/);
  assert.match(creator, /lg:flex-row/);
  assert.match(creator, /lg:w-80/);
  assert.match(creator, /lg:border-r/);
  assert.match(creator, /lg:border-l/);
});

test("element description flows from Creator JSON to read-only Viewer details", () => {
  const creator = fs.readFileSync(path.join(root, "app/create/page.tsx"), "utf8");
  assert.match(creator, /description: item\.description\.trim\(\)/);
  assert.match(creator, /creator\.description/);
  assert.match(creator, /<textarea/);

  const loader = fs.readFileSync(path.join(root, "utils/battle/loadBattleJson.ts"), "utf8");
  assert.match(loader, /unit\.description/);
  assert.match(loader, /def\?\.description/);
  assert.match(loader, /value\.description/);

  const selection = fs.readFileSync(path.join(root, "hook/useSelection.ts"), "utf8");
  assert.match(selection, /description: unit\.description/);
  assert.match(selection, /description: character\.description/);

  const panel = fs.readFileSync(
    path.join(root, "components/SelectedInfoPanel.tsx"),
    "utf8"
  );
  assert.match(panel, /selected\.description/);
  assert.match(panel, /whitespace-pre-wrap/);
  assert.doesNotMatch(panel, /<textarea/);
});


test("Creator grid origin stays centered when property panel changes editor width", () => {
  const creator = fs.readFileSync(path.join(root, "app/create/page.tsx"), "utf8");

  assert.match(
    creator,
    /backgroundPosition: mapImage[\s\S]*calc\(50% \+ 25px\) calc\(50% \+ 25px\)/
  );
  assert.match(creator, /left-1\/2 top-0 bottom-0/);
  assert.match(creator, /top-1\/2 left-0 right-0/);
});
