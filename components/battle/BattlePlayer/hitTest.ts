// utils/battle/hitTest.ts

import { BattleData } from "@/utils/battle/battle";
import { prepareFrameState } from "./runtime";

/**
 * クリック判定（ユニット → キャラの優先順）
 * cameraScale に応じて当たり判定の半径を調整
 */
export function hitTestAtTime(args: {
  battle: BattleData;
  currentTime: number;
  worldX: number;
  worldY: number;
  fadeDuration: number;
  cameraScale: number; // ← ★★★ 必須
}) {
  const { battle, currentTime, worldX, worldY, fadeDuration, cameraScale } =
    args;

  const frame = prepareFrameState(battle, currentTime, fadeDuration);

  // ============================================
  // ユニット判定（優先）
  // ============================================
  let hitUnitId: string | null = null;
  let minUnitDist = Infinity;

  const unitBaseRadius = 20; // 画像サイズ基準
  const unitRadius = unitBaseRadius / cameraScale; // ← ★ ズーム反映

  frame.units.forEach((state) => {
    if (!state.visible || !state.transform) return;

    // 階層フィルタ（LOD）
    if (frame.hierarchy.activeUnitIds.size > 0) {
      if (!frame.hierarchy.activeUnitIds.has(state.unit.id)) return;
    }

    const dx = worldX - state.transform.x;
    const dy = worldY - state.transform.y;
    const dist = dx * dx + dy * dy;

    if (dist <= unitRadius * unitRadius && dist < minUnitDist) {
      minUnitDist = dist;
      hitUnitId = state.unit.id;
    }
  });

  if (hitUnitId) {
    return { unitId: hitUnitId, characterId: null };
  }

  // ============================================
  // キャラ判定
  // ============================================
  let hitCharacterId: string | null = null;
  let minCharDist = Infinity;

  const charBaseRadius = 28;
  const charRadius = charBaseRadius / cameraScale; // ← ★ ズーム反映

  frame.characters.forEach((ch) => {
    if (!ch.visible || !ch.transform) return;

    const dx = worldX - ch.transform.x;
    const dy = worldY - ch.transform.y;
    const dist = dx * dx + dy * dy;

    if (dist <= charRadius * charRadius && dist < minCharDist) {
      minCharDist = dist;
      hitCharacterId = ch.id;
    }
  });

  return { unitId: null, characterId: hitCharacterId };
}
