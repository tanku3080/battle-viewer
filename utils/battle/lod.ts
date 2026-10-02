import type { HierarchyLevel, LODConfig } from "@/types/battle";

export const BASE_LOD_SIZE_PX = 24;

export const HIERARCHY_NODE_RADIUS: Record<HierarchyLevel, number> = {
  legion: 40,
  corps: 32,
  division: 26,
  regiment: 18,
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function fadeAt(drawSizePx: number, thresholdPx: number, fadeRange: number) {
  if (fadeRange <= 0) return drawSizePx >= thresholdPx ? 1 : 0;
  return clamp01(
    (drawSizePx - (thresholdPx - fadeRange)) / (fadeRange * 2)
  );
}

export function computeLodAlphas(lod: LODConfig, cameraScale: number) {
  const drawSizePx = BASE_LOD_SIZE_PX * cameraScale;

  const corpsToDivision = fadeAt(
    drawSizePx,
    lod.division.min,
    lod.fadeRange
  );
  const divisionBase = corpsToDivision;

  const divisionToRegiment = fadeAt(
    drawSizePx,
    lod.regiment.min,
    lod.fadeRange
  );
  const regimentBase = divisionToRegiment * divisionBase;

  const regimentToUnit = fadeAt(
    drawSizePx,
    lod.unit.min,
    lod.fadeRange
  );

  const corps = 1 - corpsToDivision;
  const division = divisionBase * (1 - divisionToRegiment);
  const regiment = regimentBase * (1 - regimentToUnit);
  const unit = regimentBase * regimentToUnit;

  return {
    legion: corps,
    corps,
    division,
    regiment,
    unit,
  };
}
