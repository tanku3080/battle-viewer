import type { BattleData, HierarchyLevel } from "@/types/battle";
import { prepareFrameState } from "./runtime";
import {
  computeLodAlphas,
  getDominantLodLevel,
  HIERARCHY_NODE_RADIUS,
} from "@/utils/battle/lod";

/**
 * クリック判定（仕様：Unit > Regiment > Division > Corps > Legion）
 * - 入力座標は world 座標で渡す（screen->world は convertClickToWorld 側で統一）
 * - cameraScale は「ワールド1.0が画面上何pxか」の係数（drawWorld と同じ）
 */
export function hitTestAtTime(args: {
  battle: BattleData;
  currentTime: number;
  worldX: number;
  worldY: number;
  fadeDuration: number;
  cameraScale: number;
}) {
  const { battle, currentTime, worldX, worldY, fadeDuration, cameraScale } =
    args;

  const frame = prepareFrameState(battle, currentTime, fadeDuration);
  const lodAlpha = computeLodAlphas(battle.lod, cameraScale);
  const dominantLevel = getDominantLodLevel(lodAlpha);

  // ============================================
  // Unit 判定（最優先）
  // ============================================
  let hitUnitId: string | null = null;
  let minUnitDist = Infinity;

  const unitBaseRadius = 16;
  const unitRadius = unitBaseRadius / cameraScale; // ← 画面上の半径を一定に寄せる

  frame.units.forEach((state) => {
    if (dominantLevel !== "unit") return;
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
    return {
      unitId: hitUnitId,
      characterId: null as string | null,
      hierarchyNodeId: null as string | null,
    };
  }

  // ============================================
  // Character 判定
  // ============================================
  let hitCharacterId: string | null = null;
  let minCharDist = Infinity;

  const charBaseRadius = 18;
  const charRadius = charBaseRadius / cameraScale;

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

  if (hitCharacterId) {
    return {
      unitId: null as string | null,
      characterId: hitCharacterId,
      hierarchyNodeId: null as string | null,
    };
  }

  // ============================================
  // Hierarchy Node 判定
  // ============================================
  const nodes = frame.hierarchy.nodes;

  const tryHitLevel = (
    level: Exclude<HierarchyLevel, "unit">,
    alpha: number
  ) => {
    if (alpha <= 0.05) return null;

    let bestId: string | null = null;
    let bestDist = Infinity;
    const r = HIERARCHY_NODE_RADIUS[level];

    for (const id of frame.hierarchy.levels[level]) {
      const node = nodes[id];
      if (!node?.position) continue;

      const dx = worldX - node.position.x;
      const dy = worldY - node.position.y;
      const dist = dx * dx + dy * dy;

      if (dist <= r * r && dist < bestDist) {
        bestDist = dist;
        bestId = id;
      }
    }

    return bestId;
  };

  if (dominantLevel !== "unit") {
    const hitHierarchy = tryHitLevel(
      dominantLevel,
      lodAlpha[dominantLevel]
    );
    if (hitHierarchy) {
      return {
        unitId: null as string | null,
        characterId: null as string | null,
        hierarchyNodeId: hitHierarchy,
      };
    }
  }

  return {
    unitId: null as string | null,
    characterId: null as string | null,
    hierarchyNodeId: null as string | null,
  };
}
