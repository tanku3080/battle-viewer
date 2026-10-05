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
  const noRuntimeImports = (specifier) => {
    throw new Error(`Unexpected runtime import in unit target: ${specifier}`);
  };
  execute(
    compiledModule.exports,
    compiledModule,
    noRuntimeImports,
    filename,
    path.dirname(filename)
  );
  return compiledModule.exports;
}

const view = loadTs("utils/battle/viewTransform.ts");
const coordinates = loadTs("utils/battle/coordinates.ts");
const lod = loadTs("utils/battle/lod.ts");

const baseView = {
  canvasWidth: 1200,
  canvasHeight: 800,
  offsetX: 0,
  offsetY: 62.5,
  baseScale: 0.5,
  mapWidth: 2400,
  mapHeight: 1350,
  viewOffsetX: 0,
  viewOffsetY: 0,
  scaleFactor: 0.5,
  worldCenterX: 1200,
  worldCenterY: 675,
};

test("zoom normal: wheel in/out changes scale by one step", () => {
  assert.equal(view.getNextZoomScale(2, -1), 2.1);
  assert.equal(view.getNextZoomScale(2, 1), 1.9);
});

test("zoom boundary: scale is clamped to 1..5", () => {
  assert.equal(view.getNextZoomScale(1, 1), 1);
  assert.equal(view.getNextZoomScale(5, -1), 5);
  assert.equal(view.clampZoomScale(0), 1);
  assert.equal(view.clampZoomScale(99), 5);
});

test("zoom abnormal: invalid values fall back safely", () => {
  assert.equal(view.clampZoomScale(Number.NaN), 1);
  assert.equal(view.clampZoomScale(Number.POSITIVE_INFINITY), 1);
  assert.equal(view.getNextZoomScale(2, Number.NaN), 2);
});

test("center zoom: map center stays on the same screen pixel at every zoom", () => {
  const center = view.getFittedMapScreenCenter(baseView);

  for (const scaleFactor of [0.5, 1, 2.5]) {
    const point = view.worldToScreenCentered(1200, 675, {
      ...baseView,
      scaleFactor,
    });
    assert.deepEqual(point, { screenX: center.x, screenY: center.y });
  }
});

test("center zoom boundary: visible bounds shrink symmetrically", () => {
  const at1 = view.getVisibleWorldBoundsCentered(baseView);
  const at2 = view.getVisibleWorldBoundsCentered({
    ...baseView,
    scaleFactor: 1,
  });

  assert.equal(at1.minX + at1.maxX, 2400);
  assert.equal(at1.minY + at1.maxY, 1350);
  assert.equal(at2.minX + at2.maxX, 2400);
  assert.equal(at2.minY + at2.maxY, 1350);
  assert.ok(at2.maxX - at2.minX < at1.maxX - at1.minX);
  assert.ok(at2.maxY - at2.minY < at1.maxY - at1.minY);
});

test("screen/world conversion round-trips", () => {
  const args = {
    ...baseView,
    viewOffsetX: 35,
    viewOffsetY: -20,
    scaleFactor: 1.75,
  };
  const screen = view.worldToScreenCentered(1440, 510, args);
  const world = view.screenToWorldCentered(screen.screenX, screen.screenY, args);

  assert.ok(Math.abs(world.worldX - 1440) < 1e-9);
  assert.ok(Math.abs(world.worldY - 510) < 1e-9);
});

test("screen/world conversion rejects invalid scale", () => {
  assert.throws(
    () => view.screenToWorldCentered(0, 0, { ...baseView, scaleFactor: 0 }),
    /scaleFactor/
  );
});

test("coordinate normal: center origin maps JSON (0,0) to map center", () => {
  const map = { width: 1050, height: 680, coordinateOrigin: "center" };
  assert.deepEqual(coordinates.toInternalPoint({ x: 0, y: 0 }, map), {
    x: 525,
    y: 340,
  });
  assert.deepEqual(coordinates.toInternalPoint({ x: -525, y: -340 }, map), {
    x: 0,
    y: 0,
  });
});

test("coordinate compatibility: omitted origin keeps top-left coordinates", () => {
  const point = { x: 100, y: 50 };
  assert.equal(
    coordinates.toInternalPoint(point, { width: 800, height: 600 }),
    point
  );
});

test("coordinate boundary: positive fractional map size is accepted", () => {
  assert.doesNotThrow(() =>
    coordinates.validateCoordinateMap({
      width: 0.1,
      height: 0.1,
      coordinateOrigin: "center",
    })
  );
});

test("coordinate abnormal: invalid maps are rejected", () => {
  assert.throws(() => coordinates.validateCoordinateMap(undefined), /map/);
  assert.throws(
    () => coordinates.validateCoordinateMap({ width: 0, height: 10 }),
    /map.width/
  );
  assert.throws(
    () => coordinates.validateCoordinateMap({ width: 10, height: Number.NaN }),
    /map.height/
  );
  assert.throws(
    () =>
      coordinates.validateCoordinateMap({
        width: 10,
        height: 10,
        coordinateOrigin: "middle",
      }),
    /coordinateOrigin/
  );
});

const lodConfig = {
  legion: { min: 0, max: 18 },
  corps: { min: 18, max: 30 },
  division: { min: 30, max: 42 },
  regiment: { min: 42, max: 54 },
  unit: { min: 54, max: 999 },
  fadeRange: 3,
};

test("LOD normal: only adjacent levels cross-fade", () => {
  for (let scale = 0; scale <= 4; scale += 0.01) {
    const alphas = lod.computeLodAlphas(lodConfig, scale);
    const visible = lod.LOD_LEVELS.filter((level) => alphas[level] > 1e-9);
    assert.ok(visible.length <= 2);
    if (visible.length === 2) {
      const a = lod.LOD_LEVELS.indexOf(visible[0]);
      const b = lod.LOD_LEVELS.indexOf(visible[1]);
      assert.equal(Math.abs(a - b), 1);
    }
  }
});

test("LOD boundary: exact first threshold is a 50/50 cross-fade", () => {
  const alphas = lod.computeLodAlphas(lodConfig, 18 / lod.BASE_LOD_SIZE_PX);
  assert.ok(Math.abs(alphas.legion - 0.5) < 1e-9);
  assert.ok(Math.abs(alphas.corps - 0.5) < 1e-9);
  assert.equal(alphas.division, 0);
});

test("sample JSONs: timelines are sorted, bounded, and visibly moving", () => {
  const files = [
    "public/sample-battle.json",
    "public/sample2-battle.json",
    "public/sample3-encirclement.json",
    "public/sample4-breakthrough.json",
    "public/sample5-chase.json",
  ];

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), file), "utf8"));
    assert.ok(data.map.width > 0 && data.map.height > 0, file);
    assert.ok(data.units.length > 0, file);

    for (const unit of data.units) {
      const points = data.timeline?.units?.[unit.id] ?? unit.timeline ?? [];
      assert.ok(points.length >= 4, `${file}: ${unit.id} needs >= 4 points`);

      for (let i = 1; i < points.length; i += 1) {
        assert.ok(points[i].t > points[i - 1].t, `${file}: unsorted ${unit.id}`);
      }

      const distance = points.slice(1).reduce((sum, point, index) => {
        const prev = points[index];
        return sum + Math.hypot(point.x - prev.x, point.y - prev.y);
      }, 0);
      assert.ok(distance >= 100, `${file}: ${unit.id} movement too small`);

      for (const point of points) {
        if (data.map.coordinateOrigin === "center") {
          assert.ok(
            point.x >= -data.map.width / 2 && point.x <= data.map.width / 2,
            `${file}: x out of range`
          );
          assert.ok(
            point.y >= -data.map.height / 2 && point.y <= data.map.height / 2,
            `${file}: y out of range`
          );
        } else {
          assert.ok(point.x >= 0 && point.x <= data.map.width, `${file}: x out`);
          assert.ok(point.y >= 0 && point.y <= data.map.height, `${file}: y out`);
        }
      }
    }
  }
});
