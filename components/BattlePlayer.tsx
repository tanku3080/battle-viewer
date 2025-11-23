"use client";

import { useRef, useEffect, useState } from "react";
import type {
  BattleData,
  TimelinePoint,
  CameraKeyframe,
} from "../types/battle";

type Props = {
  battle: BattleData;
  currentTime: number;
  viewMode: "map" | "camera";
};

// 線形補間
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// なめらか位置補間
function getSmoothPosition(timeline: TimelinePoint[], t: number) {
  if (timeline.length === 0) return null;

  if (t <= timeline[0].t) return timeline[0];
  if (t >= timeline[timeline.length - 1].t) return timeline[timeline.length - 1];

  for (let i = 0; i < timeline.length - 1; i++) {
    const p1 = timeline[i];
    const p2 = timeline[i + 1];

    if (t >= p1.t && t <= p2.t) {
      const r = (t - p1.t) / (p2.t - p1.t);
      return {
        x: lerp(p1.x, p2.x, r),
        y: lerp(p1.y, p2.y, r),
      };
    }
  }

  return null;
}

// カメラ補間
function getCameraAtTime(
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
        x: lerp(c1.x, c2.x, r),
        y: lerp(c1.y, c2.y, r),
        zoom: lerp(c1.zoom, c2.zoom, r),
      };
    }
  }

  return { x: mapWidth / 2, y: mapHeight / 2, zoom: 1 };
}

export const BattlePlayer: React.FC<Props> = ({
  battle,
  currentTime,
  viewMode,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [unitImages, setUnitImages] = useState<Record<string, HTMLImageElement>>(
    {}
  );
  const [charImages, setCharImages] = useState<Record<string, HTMLImageElement>>(
    {}
  );

  // 背景画像キャッシュ
  useEffect(() => {
    let isMounted = true;

    if (!battle.map.image) {
      setTimeout(() => {
        if (isMounted) setBgImage(null);
      }, 0);
      return;
    }

    const img = new Image();
    img.src = battle.map.image;
    img.onload = () => {
      if (isMounted) setBgImage(img);
    };

    return () => {
      isMounted = false;
    };
  }, [battle.map.image]);

  // ユニット画像キャッシュ
  useEffect(() => {
    const cache: Record<string, HTMLImageElement> = {};

    battle.units.forEach((u) => {
      if (!u.icon) return;
      const img = new Image();
      img.src = u.icon;
      img.onload = () => {
        cache[u.id] = img;
        setUnitImages((prev) => ({ ...prev, [u.id]: img }));
      };
    });
  }, [battle.units]);

  // キャラ画像キャッシュ
  useEffect(() => {
    const cache: Record<string, HTMLImageElement> = {};
    battle.characters?.forEach((c) => {
      const img = new Image();
      img.src = c.icon;
      img.onload = () => {
        cache[c.id] = img;
        setCharImages((prev) => ({ ...prev, [c.id]: img }));
      };
    });
  }, [battle.characters]);

  // 描画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { map, units, characters, camera } = battle;
    const width = map.width;
    const height = map.height;

    canvas.width = width;
    canvas.height = height;

const drawScene = () => {
  // 背景
  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, width, height);
  } else {
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, width, height);
  }

  // --- ユニット ---
  for (const unit of units) {
    const pos = getSmoothPosition(unit.timeline, currentTime);
    if (!pos) continue;

    const x = pos.x;
    const y = pos.y;

    const cached = unitImages[unit.id];
    if (cached) {
      ctx.drawImage(cached, x - 16, y - 16, 32, 32);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fillStyle = unit.color;
      ctx.fill();
    }

    ctx.fillStyle = "#fff";
    ctx.font = "12px sans-serif";
    ctx.fillText(unit.name, x + 12, y - 12);
  }

  // --- キャラ ---
  characters?.forEach((ch) => {
    const pos = getSmoothPosition(ch.timeline, currentTime);
    if (!pos) return;

    const x = pos.x;
    const y = pos.y;

    const cached = charImages[ch.id];
    if (cached) {
      ctx.drawImage(cached, x - 24, y - 24, 48, 48);
    }

    ctx.fillStyle = "#fbbf24";
    ctx.font = "13px sans-serif";
    ctx.fillText(ch.name, x + 22, y - 10);
  });
};

    // === カメラモード ===
    if (viewMode === "camera") {
      const cam = getCameraAtTime(camera, currentTime, width, height);
      ctx.save();

      const zoom = cam.zoom;
      ctx.scale(zoom, zoom);

      const cx = width / 2 / zoom;
      const cy = height / 2 / zoom;
      ctx.translate(cx - cam.x, cy - cam.y);

      drawScene();

      ctx.restore();
    } else {
      // === 全体モード ===
      drawScene();
    }
  }, [battle, currentTime, viewMode, bgImage, unitImages, charImages]);

  return (
    <div className="w-full h-full flex items-center justify-center">
      <canvas ref={canvasRef} className="rounded-md border border-gray-700" />
    </div>
  );
};
