// utils/battle/drawWorld.ts

import type { BattleData } from "@/types/battle";
import { getSmoothTransform } from "./transform";
import { getSpawnState } from "./spawnEffects";

/**
 * BattlePlayer から呼ばれる描画関数
 * 引数はオブジェクト1個で受け取る
 */
export function drawWorld(args: {
  ctx: CanvasRenderingContext2D;
  battle: BattleData;
  currentTime: number;
  showGrid: boolean;
  bgImage: HTMLImageElement | null;
  unitImages: Record<string, HTMLImageElement>;
  charImages: Record<string, HTMLImageElement>;
  fadeDuration: number;
  selectedUnitId?: string | null;
  selectedCharacterId?: string | null;
  enableSelection?: boolean;
}) {
  const {
    ctx,
    battle,
    currentTime,
    showGrid,
    bgImage,
    unitImages,
    charImages,
    fadeDuration,
    selectedUnitId,
    selectedCharacterId,
    enableSelection,
  } = args;

  const { map, units, characters } = battle;
  const mapWidth = map.width;
  const mapHeight = map.height;

  /** 背景 */
  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, mapWidth, mapHeight);
  } else {
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, mapWidth, mapHeight);
  }

  /** グリッド */
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

  /** -------------------------
   *  ユニット描画
   * ------------------------*/
  for (const unit of units) {
    if (unit.timeline.length === 0) continue;
    const tr = getSmoothTransform(unit.timeline, currentTime);
    if (!tr) continue;

    const spawnTime = unit.timeline[0].t;
    const despawnTime = unit.timeline[unit.timeline.length - 1].t;
    const { visible, alpha, scale } = getSpawnState(
      currentTime,
      spawnTime,
      despawnTime,
      fadeDuration
    );

    if (!visible) continue;

    ctx.save();
    ctx.translate(tr.x, tr.y);
    ctx.rotate(tr.dir ?? 0);
    ctx.globalAlpha = alpha;
    ctx.scale(scale, scale);

    const cached = unitImages[unit.id];
    if (cached) {
      ctx.drawImage(cached, -16, -16, 32, 32);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fillStyle = unit.color;
      ctx.fill();
    }

    // 選択ハイライト（ユニット）
    if (enableSelection && selectedUnitId && selectedUnitId === unit.id) {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // 名前（向きに影響されないよう戻して書く）
    ctx.save();
    ctx.rotate(-(tr.dir ?? 0));
    ctx.fillStyle = "#fff";
    ctx.font = "12px sans-serif";
    ctx.fillText(unit.name, 12, -14);
    ctx.restore();

    ctx.restore();
  }

  /** -------------------------
   *  キャラ描画
   * ------------------------*/
  characters?.forEach((ch) => {
    if (ch.timeline.length === 0) return;
    const tr = getSmoothTransform(ch.timeline, currentTime);
    if (!tr) return;

    const spawnTime = ch.timeline[0].t;
    const despawnTime = ch.timeline[ch.timeline.length - 1].t;
    const { visible, alpha, scale } = getSpawnState(
      currentTime,
      spawnTime,
      despawnTime,
      fadeDuration
    );

    if (!visible) return;

    ctx.save();
    ctx.translate(tr.x, tr.y);
    ctx.rotate(tr.dir ?? 0);
    ctx.globalAlpha = alpha;
    ctx.scale(scale, scale);

    const cached = charImages[ch.id];
    if (cached) {
      ctx.drawImage(cached, -24, -24, 48, 48);
    } else {
      ctx.fillStyle = "#f97316";
      ctx.fillRect(-12, -12, 24, 24);
    }

    // 選択ハイライト（キャラ）
    if (
      enableSelection &&
      selectedCharacterId &&
      selectedCharacterId === ch.id
    ) {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // 名前
    ctx.save();
    ctx.rotate(-(tr.dir ?? 0));
    ctx.fillStyle = "#fbbf24";
    ctx.font = "13px sans-serif";
    ctx.fillText(ch.name, 12, -10);
    ctx.restore();

    ctx.restore();
  });
}
