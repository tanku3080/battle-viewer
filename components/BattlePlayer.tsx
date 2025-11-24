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
  showGrid: boolean;
};

// 線形補間
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// なめらか位置補間
function getSmoothPosition(timeline: TimelinePoint[], t: number) {
  if (timeline.length === 0) return null;

  if (t <= timeline[0].t) return timeline[0];
  if (t >= timeline[timeline.length - 1].t)
    return timeline[timeline.length - 1];

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

// カメラ補間（マップ座標系）
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
  showGrid,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [unitImages, setUnitImages] = useState<
    Record<string, HTMLImageElement>
  >({});
  const [charImages, setCharImages] = useState<
    Record<string, HTMLImageElement>
  >({});

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
    battle.units.forEach((u) => {
      if (!u.icon) return;
      const img = new Image();
      img.src = u.icon;
      img.onload = () => setUnitImages((prev) => ({ ...prev, [u.id]: img }));
    });
  }, [battle.units]);

  // キャラ画像キャッシュ
  useEffect(() => {
    battle.characters?.forEach((c) => {
      const img = new Image();
      img.src = c.icon;
      img.onload = () => setCharImages((prev) => ({ ...prev, [c.id]: img }));
    });
  }, [battle.characters]);

  // 描画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const canvasWidth = parent.clientWidth;
    const canvasHeight = parent.clientHeight;
    if (canvasWidth === 0 || canvasHeight === 0) return;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { map, units, characters } = battle;
    const mapWidth = map.width;
    const mapHeight = map.height;

    // マップ座標→画面座標スケール
    const scaleX = canvasWidth / mapWidth;
    const scaleY = canvasHeight / mapHeight;

    const drawGrid = () => {
      if (!showGrid) return;

      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;

      const gridSize = 50; // マップ座標で50ごと

      // 縦線（x）
      for (let x = 0; x <= mapWidth; x += gridSize) {
        const sx = x * scaleX;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, canvasHeight);
        ctx.stroke();
      }

      // 横線（y）
      for (let y = 0; y <= mapHeight; y += gridSize) {
        const sy = y * scaleY;
        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(canvasWidth, sy);
        ctx.stroke();
      }

      ctx.restore();
    };

    const drawScene = () => {
      // クリア
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // 背景
      if (bgImage) {
        ctx.drawImage(bgImage, 0, 0, canvasWidth, canvasHeight);
      } else {
        ctx.fillStyle = "#020617";
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      }

      // グリッド
      drawGrid();

      // --- ユニット ---
      for (const unit of units) {
        const pos = getSmoothPosition(unit.timeline, currentTime);
        if (!pos) continue;

        const x = pos.x * scaleX;
        const y = pos.y * scaleY;

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

        const x = pos.x * scaleX;
        const y = pos.y * scaleY;

        const cached = charImages[ch.id];
        if (cached) {
          ctx.drawImage(cached, x - 24, y - 24, 48, 48);
        }

        ctx.fillStyle = "#fbbf24";
        ctx.font = "13px sans-serif";
        ctx.fillText(ch.name, x + 22, y - 10);
      });
    };

    if (viewMode === "camera") {
      const cam = getCameraAtTime(
        battle.camera,
        currentTime,
        mapWidth,
        mapHeight
      );

      const camX = cam.x * scaleX;
      const camY = cam.y * scaleY;

      ctx.save();

      ctx.scale(cam.zoom, cam.zoom);

      const screenCenterX = canvasWidth / 2 / cam.zoom;
      const screenCenterY = canvasHeight / 2 / cam.zoom;

      ctx.translate(screenCenterX - camX, screenCenterY - camY);

      drawScene();

      ctx.restore();
    } else {
      drawScene();
    }
  }, [
    battle,
    currentTime,
    viewMode,
    showGrid,
    bgImage,
    unitImages,
    charImages,
  ]);

  return (
    <div className="w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};
