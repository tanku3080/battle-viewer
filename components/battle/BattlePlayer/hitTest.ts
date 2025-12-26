import type { BattleData, HierarchyLevel } from "@/types/battle";
import { prepareFrameState } from "./runtime";

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

  // ============================================
  // Unit 判定（最優先）
  // ============================================
  let hitUnitId: string | null = null;
  let minUnitDist = Infinity;

  const unitBaseRadius = 16;
  const unitRadius = unitBaseRadius / cameraScale; // ← 画面上の半径を一定に寄せる

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
  // Hierarchy Node 判定（Unit > ... > Legion の残り）
  // ============================================

  // drawWorld と同じ基準
  const BASE_LOD_SIZE_PX = 24;
  type LodLevel = HierarchyLevel | "unit";

  const LOD_CONFIG: Record<LodLevel, { min: number; max: number }> & {
    fadeRange: number;
  } = {
    legion: { min: 0, max: 7 },
    corps: { min: 0, max: 14 },
    division: { min: 14, max: 28 },
    regiment: { min: 28, max: 56 },
    unit: { min: 56, max: 999 },
    fadeRange: 20,
  };

  const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const drawSizePx = BASE_LOD_SIZE_PX * cameraScale;
  const fadeRange = LOD_CONFIG.fadeRange;

  const fade = (thresholdPx: number) =>
    clamp01((drawSizePx - (thresholdPx - fadeRange)) / (fadeRange * 2));

  // Corps → Division → Regiment の段階式（drawWorld と同じ）
  const fCD = fade(LOD_CONFIG.division.min);
  const alphaCorps = 1 - fCD;
  const alphaDivisionBase = fCD;

  const fDR = fade(LOD_CONFIG.regiment.min);
  const alphaRegiment = fDR * alphaDivisionBase;
  const alphaDivision = alphaDivisionBase * (1 - fDR);

  // ノード半径（drawWorld と統一：ワールド単位）
  const NODE_RADIUS: Record<Exclude<HierarchyLevel, "unit">, number> = {
    legion: 40,
    corps: 32,
    division: 26,
    regiment: 18,
  };

  const nodes = frame.hierarchy.nodes;

  const tryHitLevel = (
    level: Exclude<HierarchyLevel, "unit">,
    alpha: number
  ) => {
    if (alpha <= 0.05) return null;

    let bestId: string | null = null;
    let bestDist = Infinity;
    const r = NODE_RADIUS[level];

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

  // 優先：Regiment > Division > Corps > Legion
  const hitReg = tryHitLevel("regiment", alphaRegiment);
  if (hitReg)
    return {
      unitId: null as string | null,
      characterId: null as string | null,
      hierarchyNodeId: hitReg,
    };

  const hitDiv = tryHitLevel("division", alphaDivision);
  if (hitDiv)
    return {
      unitId: null as string | null,
      characterId: null as string | null,
      hierarchyNodeId: hitDiv,
    };

  const hitCorps = tryHitLevel("corps", alphaCorps);
  if (hitCorps)
    return {
      unitId: null as string | null,
      characterId: null as string | null,
      hierarchyNodeId: hitCorps,
    };

  const hitLeg = tryHitLevel("legion", 1);
  if (hitLeg)
    return {
      unitId: null as string | null,
      characterId: null as string | null,
      hierarchyNodeId: hitLeg,
    };

  return {
    unitId: null as string | null,
    characterId: null as string | null,
    hierarchyNodeId: null as string | null,
  };
}
