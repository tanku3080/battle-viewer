import type {
  HierarchyLevel,
  LODConfig,
  LodLevel,
} from "@/types/battle";

export const BASE_LOD_SIZE_PX = 24;
export const LOD_LEVELS: readonly LodLevel[] = [
  "legion",
  "corps",
  "division",
  "regiment",
  "unit",
];

export const HIERARCHY_NODE_RADIUS: Record<HierarchyLevel, number> = {
  legion: 40,
  corps: 32,
  division: 26,
  regiment: 18,
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function computeLodAlphas(lod: LODConfig, cameraScale: number) {
  const drawSizePx =
    BASE_LOD_SIZE_PX * (Number.isFinite(cameraScale) ? Math.max(0, cameraScale) : 0);
  const alphas: Record<LodLevel, number> = {
    legion: 0,
    corps: 0,
    division: 0,
    regiment: 0,
    unit: 0,
  };
  const thresholds = LOD_LEVELS.slice(1).map((level) => lod[level].min);
  const requestedFade = Number.isFinite(lod.fadeRange)
    ? Math.max(0, lod.fadeRange)
    : 0;

  for (let index = 0; index < thresholds.length; index += 1) {
    const threshold = thresholds[index];
    const previousGap =
      index === 0 ? Number.POSITIVE_INFINITY : threshold - thresholds[index - 1];
    const nextGap =
      index === thresholds.length - 1
        ? Number.POSITIVE_INFINITY
        : thresholds[index + 1] - threshold;

    // Adjacent transition windows must never overlap. This guarantees that
    // only the current level and its immediate successor can be visible.
    const fadeRadius = Math.max(
      0,
      Math.min(requestedFade, previousGap / 2, nextGap / 2)
    );
    const transitionStart = threshold - fadeRadius;
    const transitionEnd = threshold + fadeRadius;

    if (drawSizePx < transitionStart) {
      alphas[LOD_LEVELS[index]] = 1;
      return alphas;
    }

    if (fadeRadius > 0 && drawSizePx <= transitionEnd) {
      const progress = smoothstep(
        (drawSizePx - transitionStart) / (fadeRadius * 2)
      );
      alphas[LOD_LEVELS[index]] = 1 - progress;
      alphas[LOD_LEVELS[index + 1]] = progress;
      return alphas;
    }
  }

  alphas.unit = 1;
  return alphas;
}

export function getDominantLodLevel(
  alphas: Record<LodLevel, number>
): LodLevel {
  return LOD_LEVELS.reduce((dominant, level) =>
    alphas[level] > alphas[dominant] ? level : dominant
  );
}
