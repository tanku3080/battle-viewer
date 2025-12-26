import type { BattleData } from "@/utils/battle/battle";
import type { FrameState, NodeWithPosition } from "./runtime";
import { prepareFrameState } from "./runtime";

type DrawArgs = {
  ctx: CanvasRenderingContext2D;
  battle: BattleData;
  currentTime: number;
  showGrid: boolean;
  bgImage: HTMLImageElement | null;
  unitImages: Record<string, HTMLImageElement>;
  charImages: Record<string, HTMLImageElement>;
  fadeDuration: number;
  cameraScale?: number;
  frameState?: FrameState;
  selectedUnitId?: string | null;
  selectedCharacterId?: string | null;
  enableSelection?: boolean;
};

const LEVELS = {
  legion: { radius: 40, font: "16px sans-serif" },
  corps: { radius: 32, font: "15px sans-serif" },
  division: { radius: 26, font: "14px sans-serif" },
  regiment: { radius: 18, font: "13px sans-serif" },
};

// LOD 設定（仕様書デフォルト）
const LOD_CONFIG = {
  corps: { min: 0, max: 14 },
  division: { min: 14, max: 28 },
  regiment: { min: 28, max: 56 },
  unit: { min: 56, max: 999 },
  fadeRange: 20,
};

// LOD 判定用の基準サイズ（ワールド座標上の大きさ 1.0）
// 実際のピクセルサイズ = BASE_SIZE * cameraScale
const BASE_LOD_SIZE_PX = 24;

function clamp01(v: number) {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function nodeColor(node: NodeWithPosition, battle: BattleData) {
  for (const uid of node.unitIds) {
    const unit = battle.unitIndex[uid];
    if (unit) return unit.color;
  }
  return "#cbd5f5";
}

function drawHierarchyNodes(params: {
  ctx: CanvasRenderingContext2D;
  nodes: NodeWithPosition[];
  alpha: number;
  battle: BattleData;
  sizeKey: "legion" | "corps" | "division" | "regiment";
}) {
  const { ctx, nodes, alpha, battle, sizeKey } = params;
  if (alpha <= 0) return;

  const style = LEVELS[sizeKey];

  nodes.forEach((node) => {
    if (!node.position) return;
    const baseAlpha = node.status === "destroyed" ? 0.35 : 1;
    const nodeAlpha = alpha * baseAlpha;
    if (nodeAlpha <= 0) return;

    const color = nodeColor(node, battle);

    ctx.save();
    ctx.translate(node.position.x, node.position.y);
    ctx.globalAlpha *= nodeAlpha;

    ctx.beginPath();
    ctx.arc(0, 0, style.radius, 0, Math.PI * 2);
    ctx.fillStyle = color + "33";
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#e2e8f0";
    ctx.font = style.font;
    ctx.textBaseline = "middle";
    ctx.fillText(node.name, style.radius + 6, 0);

    ctx.restore();
  });
}

// =============================
//   ユニット描画（ズーム対応）
// =============================
function drawUnits(params: {
  ctx: CanvasRenderingContext2D;
  frame: FrameState;
  battle: BattleData;
  alpha: number;
  unitImages: Record<string, HTMLImageElement>;
  selectedUnitId?: string | null;
  enableSelection?: boolean;
  cameraScale: number;
}) {
  const {
    ctx,
    frame,
    battle,
    alpha,
    unitImages,
    selectedUnitId,
    enableSelection,
    cameraScale,
  } = params;

  if (alpha <= 0) return;

  const activeUnits = frame.hierarchy.activeUnitIds;

  frame.units.forEach((state) => {
    const { unit, transform, visible, alpha: spawnAlpha, scale } = state;
    if (!transform || !visible) return;
    if (activeUnits.size > 0 && !activeUnits.has(unit.id)) return;

    const drawAlpha = spawnAlpha * alpha;
    if (drawAlpha <= 0) return;

    // cameraScale が大きくなるほど「画面上のサイズ」は大きくなる
    // → ここではアイコンを「相対的に」調整したい場合に使える
    const baseSize = 32;
    const iconSize = baseSize;
    const radius = 12;

    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.rotate(transform.dir ?? 0);
    ctx.globalAlpha = drawAlpha;
    ctx.scale(scale, scale);

    const cached = unitImages[unit.id];
    if (cached) {
      ctx.drawImage(cached, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fillStyle = unit.color;
      ctx.fill();
    }

    if (enableSelection && selectedUnitId === unit.id) {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(0, 0, iconSize / 2 + 8, 0, Math.PI * 2);
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  });
}

// =============================
//   キャラクター描画
// =============================
function drawCharacters(params: {
  ctx: CanvasRenderingContext2D;
  frame: FrameState;
  charImages: Record<string, HTMLImageElement>;
  selectedCharacterId?: string | null;
  enableSelection?: boolean;
  cameraScale: number;
}) {
  const {
    ctx,
    frame,
    charImages,
    selectedCharacterId,
    enableSelection,
    cameraScale,
  } = params;

  frame.characters.forEach((ch) => {
    const { transform, visible, alpha, scale } = ch;
    if (!transform || !visible) return;

    const size = 48; // とりあえず LOD 非対象（B ランク対応で調整可）

    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.rotate(transform.dir ?? 0);
    ctx.globalAlpha = alpha;
    ctx.scale(scale, scale);

    const cached = charImages[ch.id];
    if (cached) {
      ctx.drawImage(cached, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = "#f97316";
      ctx.fillRect(-size / 2, -size / 2, size, size);
    }

    if (enableSelection && selectedCharacterId === ch.id) {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(0, 0, size / 2 + 10, 0, Math.PI * 2);
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  });
}

// ===================================================
//                   drawWorld 本体
// ===================================================
export function drawWorld(args: DrawArgs) {
  const {
    ctx,
    battle,
    currentTime,
    showGrid,
    bgImage,
    unitImages,
    charImages,
    fadeDuration,
    cameraScale = 1,
    frameState,
    selectedUnitId,
    selectedCharacterId,
    enableSelection,
  } = args;

  const { map } = battle;
  const mapWidth = map.width;
  const mapHeight = map.height;

  const frame =
    frameState ?? prepareFrameState(battle, currentTime, fadeDuration);

  // 背景
  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, mapWidth, mapHeight);
  } else {
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, mapWidth, mapHeight);
  }

  // グリッド
  if (showGrid) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    const gridSize = 50;

    for (let x = 0; x <= mapWidth; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, mapHeight);
      ctx.stroke();
    }

    for (let y = 0; y <= mapHeight; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(mapWidth, y);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ------------------- LOD 計算（仕様準拠） -------------------
  // drawSizePx = BASE_LOD_SIZE_PX * cameraScale（※ baseScale は入れない）
  const drawSizePx = BASE_LOD_SIZE_PX * cameraScale;
  const fadeRange = LOD_CONFIG.fadeRange;

  const fade = (thresholdPx: number) =>
    clamp01((drawSizePx - (thresholdPx - fadeRange)) / (fadeRange * 2));

  let alphaCorps = 1;
  let alphaDivision = 0;
  let alphaRegiment = 0;
  let alphaUnit = 0;

  // Corps → Division
  const fCD = fade(LOD_CONFIG.division.min);
  alphaDivision = fCD;
  alphaCorps = 1 - fCD;

  // Division → Regiment
  const fDR = fade(LOD_CONFIG.regiment.min);
  const divBase = alphaDivision;
  alphaRegiment = fDR * divBase;
  alphaDivision = divBase * (1 - fDR);

  // Regiment → Unit
  const fRU = fade(LOD_CONFIG.unit.min);
  const regBase = alphaRegiment;
  alphaUnit = fRU * regBase;
  alphaRegiment = regBase * (1 - fRU);

  const alphaLegion = alphaCorps; // レギオンは Corps と同じ扱い

  // ------------------- 階層描画 -------------------
  drawHierarchyNodes({
    ctx,
    nodes: frame.hierarchy.levels.legion
      .map((id) => frame.hierarchy.nodes[id])
      .filter(Boolean),
    alpha: alphaLegion,
    battle,
    sizeKey: "legion",
  });

  drawHierarchyNodes({
    ctx,
    nodes: frame.hierarchy.levels.corps
      .map((id) => frame.hierarchy.nodes[id])
      .filter(Boolean),
    alpha: alphaCorps,
    battle,
    sizeKey: "corps",
  });

  drawHierarchyNodes({
    ctx,
    nodes: frame.hierarchy.levels.division
      .map((id) => frame.hierarchy.nodes[id])
      .filter(Boolean),
    alpha: alphaDivision,
    battle,
    sizeKey: "division",
  });

  drawHierarchyNodes({
    ctx,
    nodes: frame.hierarchy.levels.regiment
      .map((id) => frame.hierarchy.nodes[id])
      .filter(Boolean),
    alpha: alphaRegiment,
    battle,
    sizeKey: "regiment",
  });

  // ユニット
  drawUnits({
    ctx,
    frame,
    battle,
    alpha: alphaUnit,
    unitImages,
    selectedUnitId,
    enableSelection,
    cameraScale,
  });

  // キャラ（いまは LOD 非対象）
  drawCharacters({
    ctx,
    frame,
    charImages,
    selectedCharacterId,
    enableSelection,
    cameraScale,
  });
}
