import { RenderTransform } from "@/types/battle";

/**
 * screen(px) -> world の逆変換
 *
 * 描画側（BattlePlayer）の transform と 1:1 で一致させる。
 * - viewOffsetX/Y : ドラッグ移動(px)
 * - baseScale     : contain fit
 * - scaleFactor   : baseScale * (cam.zoom or 1) * userScale
 * - offsetX/Y     : contain の余白(px)
 */
export function convertClickToWorld(
  clickX: number,
  clickY: number,
  transform: RenderTransform
) {
  if (transform.mode === "map") {
    // 描画: translate(viewOffset) -> translate(offset) -> scale(scaleFactor)
    // screen = viewOffset + offset + world * scaleFactor
    return {
      worldX:
        (clickX - transform.viewOffsetX - transform.offsetX) /
        transform.scaleFactor,
      worldY:
        (clickY - transform.viewOffsetY - transform.offsetY) /
        transform.scaleFactor,
    };
  }

  if (transform.mode === "camera") {
    // 描画: translate(offset) -> translate(mapCenter*baseScale) -> translate(viewOffset) -> scale(scaleFactor) -> translate(-cam)
    // ただし mapCenter*baseScale + offset == canvasCenter
    const centerX =
      transform.offsetX + (transform.mapWidth * transform.baseScale) / 2;
    const centerY =
      transform.offsetY + (transform.mapHeight * transform.baseScale) / 2;

    const sx = clickX - centerX - transform.viewOffsetX;
    const sy = clickY - centerY - transform.viewOffsetY;

    return {
      worldX: sx / transform.scaleFactor + transform.cam.x,
      worldY: sy / transform.scaleFactor + transform.cam.y,
    };
  }

  throw new Error("Unknown transform");
}
