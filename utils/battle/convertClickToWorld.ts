import { RenderTransform } from "@/types/battle";

export function convertClickToWorld(
  clickX: number,
  clickY: number,
  transform: RenderTransform
) {
  if (transform.mode === "map") {
    return {
      worldX: (clickX - transform.offsetX) / transform.baseScale,
      worldY: (clickY - transform.offsetY) / transform.baseScale,
    };
  }

  if (transform.mode === "camera") {
    const scale = transform.baseScale * transform.cam.zoom;

    const cx = clickX - transform.canvasWidth / 2;
    const cy = clickY - transform.canvasHeight / 2;

    return {
      worldX: cx / scale + transform.cam.x,
      worldY: cy / scale + transform.cam.y,
    };
  }

  throw new Error("Unknown transform");
}
