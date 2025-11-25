// utils/battle/transform.ts

import type { TimelinePoint, CameraKeyframe } from "@/types/battle";

/**
 * x / y / dir を時間に対して補間する
 */
export function getSmoothTransform(timeline: TimelinePoint[], t: number) {
  if (timeline.length === 0) return null;

  if (t <= timeline[0].t) return timeline[0];
  if (t >= timeline[timeline.length - 1].t)
    return timeline[timeline.length - 1];

  for (let i = 0; i < timeline.length - 1; i++) {
    const p1 = timeline[i];
    const p2 = timeline[i + 1];

    if (t >= p1.t && t <= p2.t) {
      const r = (t - p1.t) / (p2.t - p1.t);

      const dir1 = p1.dir ?? 0;
      const dir2 = p2.dir ?? dir1;

      // 角度差を短い方向に調整
      let d = dir2 - dir1;
      d = Math.atan2(Math.sin(d), Math.cos(d)); // -π 〜 π に正規化

      return {
        t: p1.t + (p2.t - p1.t) * r,
        x: p1.x + (p2.x - p1.x) * r,
        y: p1.y + (p2.y - p1.y) * r,
        dir: dir1 + d * r,
      };
    }
  }
  return null;
}

/**
 * カメラキーの補間
 */
export function getCameraAtTime(
  timeline: CameraKeyframe[] | undefined,
  t: number,
  mapWidth: number,
  mapHeight: number
) {
  if (!timeline || timeline.length === 0)
    return { x: mapWidth / 2, y: mapHeight / 2, zoom: 1 };

  if (t <= timeline[0].t) return timeline[0];
  if (t >= timeline[timeline.length - 1].t)
    return timeline[timeline.length - 1];

  for (let i = 0; i < timeline.length - 1; i++) {
    const c1 = timeline[i];
    const c2 = timeline[i + 1];

    if (t >= c1.t && t <= c2.t) {
      const r = (t - c1.t) / (c2.t - c1.t);
      return {
        x: c1.x + (c2.x - c1.x) * r,
        y: c1.y + (c2.y - c1.y) * r,
        zoom: c1.zoom + (c2.zoom - c1.zoom) * r,
      };
    }
  }

  return { x: mapWidth / 2, y: mapHeight / 2, zoom: 1 };
}
