export type CenteredViewArgs = {
  canvasWidth: number;
  canvasHeight: number;
  offsetX: number;
  offsetY: number;
  baseScale: number;
  mapWidth: number;
  mapHeight: number;
  viewOffsetX: number;
  viewOffsetY: number;
  scaleFactor: number;
  worldCenterX: number;
  worldCenterY: number;
};

export function clampZoomScale(
  value: number,
  min = 1,
  max = 5
) {
  const safeMin = Number.isFinite(min) ? min : 1;
  const safeMax = Number.isFinite(max) ? Math.max(safeMin, max) : Math.max(safeMin, 5);

  if (!Number.isFinite(value)) return safeMin;
  return Math.min(safeMax, Math.max(safeMin, value));
}

export function getNextZoomScale(
  current: number,
  deltaY: number,
  step = 0.1,
  min = 1,
  max = 5
) {
  const base = clampZoomScale(current, min, max);
  if (!Number.isFinite(deltaY) || deltaY === 0) return base;

  const safeStep = Number.isFinite(step) && step > 0 ? step : 0.1;
  const next = base + (deltaY > 0 ? -safeStep : safeStep);
  return clampZoomScale(next, min, max);
}

export function getFittedMapScreenCenter(args: Pick<
  CenteredViewArgs,
  "offsetX" | "offsetY" | "baseScale" | "mapWidth" | "mapHeight"
>) {
  return {
    x: args.offsetX + (args.mapWidth * args.baseScale) / 2,
    y: args.offsetY + (args.mapHeight * args.baseScale) / 2,
  };
}

function assertScaleFactor(scaleFactor: number) {
  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) {
    throw new Error("scaleFactor must be a finite number greater than 0");
  }
}

export function screenToWorldCentered(
  screenX: number,
  screenY: number,
  args: CenteredViewArgs
) {
  assertScaleFactor(args.scaleFactor);
  const center = getFittedMapScreenCenter(args);

  return {
    worldX:
      (screenX - center.x - args.viewOffsetX) / args.scaleFactor +
      args.worldCenterX,
    worldY:
      (screenY - center.y - args.viewOffsetY) / args.scaleFactor +
      args.worldCenterY,
  };
}

export function worldToScreenCentered(
  worldX: number,
  worldY: number,
  args: CenteredViewArgs
) {
  assertScaleFactor(args.scaleFactor);
  const center = getFittedMapScreenCenter(args);

  return {
    screenX:
      center.x +
      args.viewOffsetX +
      (worldX - args.worldCenterX) * args.scaleFactor,
    screenY:
      center.y +
      args.viewOffsetY +
      (worldY - args.worldCenterY) * args.scaleFactor,
  };
}

export function getVisibleWorldBoundsCentered(args: CenteredViewArgs) {
  const topLeft = screenToWorldCentered(0, 0, args);
  const bottomRight = screenToWorldCentered(
    args.canvasWidth,
    args.canvasHeight,
    args
  );

  return {
    minX: Math.min(topLeft.worldX, bottomRight.worldX),
    minY: Math.min(topLeft.worldY, bottomRight.worldY),
    maxX: Math.max(topLeft.worldX, bottomRight.worldX),
    maxY: Math.max(topLeft.worldY, bottomRight.worldY),
  };
}
