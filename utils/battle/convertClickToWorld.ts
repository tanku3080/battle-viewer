import { RenderTransform } from "@/types/battle";
import { screenToWorldCentered } from "./viewTransform";

/**
 * screen(px) -> world の逆変換。
 * 描画側と同じ「画面中央をズーム軸」にする。
 */
export function convertClickToWorld(
  clickX: number,
  clickY: number,
  transform: RenderTransform
) {
  const worldCenter =
    transform.mode === "camera"
      ? transform.cam
      : { x: transform.mapWidth / 2, y: transform.mapHeight / 2 };

  return screenToWorldCentered(clickX, clickY, {
    canvasWidth: transform.canvasWidth,
    canvasHeight: transform.canvasHeight,
    offsetX: transform.offsetX,
    offsetY: transform.offsetY,
    baseScale: transform.baseScale,
    mapWidth: transform.mapWidth,
    mapHeight: transform.mapHeight,
    viewOffsetX: transform.viewOffsetX,
    viewOffsetY: transform.viewOffsetY,
    scaleFactor: transform.scaleFactor,
    worldCenterX: worldCenter.x,
    worldCenterY: worldCenter.y,
  });
}
