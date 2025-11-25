// utils/battle/hitTest.ts

import type { BattleData } from "@/types/battle";
import { getSmoothTransform } from "./transform";
import { getSpawnState } from "./spawnEffects";

/**
 * キャンバスクリックを「マップ座標」に変換
 */
export function screenToWorld(
  clickX: number,
  clickY: number,
  canvas: HTMLCanvasElement,
  mapWidth: number,
  mapHeight: number
) {
  const rect = canvas.getBoundingClientRect();

  const x = clickX - rect.left;
  const y = clickY - rect.top;

  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;

  const scaleX = canvasWidth / mapWidth;
  const scaleY = canvasHeight / mapHeight;
  const baseScale = Math.min(scaleX, scaleY);

  const offsetX = (canvasWidth - mapWidth * baseScale) / 2;
  const offsetY = (canvasHeight - mapHeight * baseScale) / 2;

  return {
    worldX: (x - offsetX) / baseScale,
    worldY: (y - offsetY) / baseScale,
  };
}

/**
 * クリック判定（ユニット → キャラの優先順）
 */
export function hitTest(
  battle: BattleData,
  t: number,
  worldX: number,
  worldY: number
) {
  const fadeDuration = 0.5;

  let hitUnitId: string | null = null;
  let minUnitDist = Infinity;

  battle.units.forEach((unit) => {
    if (unit.timeline.length === 0) return;

    const tr = getSmoothTransform(unit.timeline, t);
    if (!tr) return;

    const spawnTime = unit.timeline[0].t;
    const despawnTime = unit.timeline[unit.timeline.length - 1].t;

    const { visible } = getSpawnState(t, spawnTime, despawnTime, fadeDuration);
    if (!visible) return;

    const dx = worldX - tr.x;
    const dy = worldY - tr.y;
    const dist = dx * dx + dy * dy;

    const radius = 20;
    if (dist <= radius * radius && dist < minUnitDist) {
      minUnitDist = dist;
      hitUnitId = unit.id;
    }
  });

  if (hitUnitId) {
    return { kind: "unit" as const, id: hitUnitId };
  }

  // ---- キャラ判定 ----
  let hitCharacterId: string | null = null;
  let minCharDist = Infinity;

  battle.characters?.forEach((ch) => {
    if (ch.timeline.length === 0) return;

    const tr = getSmoothTransform(ch.timeline, t);
    if (!tr) return;

    const spawnTime = ch.timeline[0].t;
    const despawnTime = ch.timeline[ch.timeline.length - 1].t;

    const { visible } = getSpawnState(t, spawnTime, despawnTime, fadeDuration);
    if (!visible) return;

    const dx = worldX - tr.x;
    const dy = worldY - tr.y;
    const dist = dx * dx + dy * dy;

    const radius = 24;
    if (dist <= radius * radius && dist < minCharDist) {
      minCharDist = dist;
      hitCharacterId = ch.id;
    }
  });

  if (hitCharacterId) {
    return { kind: "character" as const, id: hitCharacterId };
  }

  return null;
}

/**
 * BattlePlayer.tsx から使う用のラッパー
 * { unitId, characterId } を返す
 */
export function hitTestAtTime(args: {
  battle: BattleData;
  currentTime: number;
  worldX: number;
  worldY: number;
  fadeDuration: number; // 今は未使用だがインターフェースだけ合わせておく
}) {
  const { battle, currentTime, worldX, worldY } = args;

  const res = hitTest(battle, currentTime, worldX, worldY);

  if (!res) {
    return { unitId: null, characterId: null };
  }

  if (res.kind === "character") {
    return { unitId: null, characterId: res.id };
  }

  return { unitId: res.id, characterId: null };
}
