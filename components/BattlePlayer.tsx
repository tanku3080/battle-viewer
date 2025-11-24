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
  // 開発ビュー用：ユニット選択
  selectedUnitId?: string | null;
  onSelectUnit?: (id: string | null) => void;
  enableSelection?: boolean;
};

// 線形補間
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// 位置補間
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

// カメラ補間（マップ座標）
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

// 出現/消滅アニメーション状態
function getSpawnState(
  t: number,
  spawnTime: number,
  despawnTime: number,
  fadeDuration: number
) {
  // まだ出現前
  if (t < spawnTime) {
    return { visible: false, alpha: 0, scale: 0 };
  }

  // 出現フェードイン
  if (t >= spawnTime && t < spawnTime + fadeDuration) {
    const ratio = (t - spawnTime) / fadeDuration; // 0→1
    const alpha = ratio;
    const scale = 0.2 + 0.8 * ratio;
    return { visible: true, alpha, scale };
  }

  // 通常表示
  if (t >= spawnTime + fadeDuration && t <= despawnTime) {
    return { visible: true, alpha: 1, scale: 1 };
  }

  // 消滅フェードアウト
  if (t > despawnTime && t <= despawnTime + fadeDuration) {
    const ratio = 1 - (t - despawnTime) / fadeDuration; // 1→0
    if (ratio <= 0) {
      return { visible: false, alpha: 0, scale: 0 };
    }
    const alpha = ratio;
    const scale = 0.2 + 0.8 * ratio;
    return { visible: true, alpha, scale };
  }

  // 完全消滅
  return { visible: false, alpha: 0, scale: 0 };
}

export const BattlePlayer: React.FC<Props> = ({
  battle,
  currentTime,
  viewMode,
  showGrid,
  selectedUnitId,
  onSelectUnit,
  enableSelection,
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
      img.onload = () =>
        setUnitImages((prev) => ({
          ...prev,
          [u.id]: img,
        }));
    });
  }, [battle.units]);

  // キャラ画像キャッシュ
  useEffect(() => {
    battle.characters?.forEach((c) => {
      const img = new Image();
      img.src = c.icon;
      img.onload = () =>
        setCharImages((prev) => ({
          ...prev,
          [c.id]: img,
        }));
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

    // アスペクト比維持でフィット
    const scaleX = canvasWidth / mapWidth;
    const scaleY = canvasHeight / mapHeight;
    const baseScale = Math.min(scaleX, scaleY);

    // 全体表示時のオフセット（センタリング）
    const offsetX = (canvasWidth - mapWidth * baseScale) / 2;
    const offsetY = (canvasHeight - mapHeight * baseScale) / 2;

    // ワールド（マップ座標）を描画する関数
    const drawWorld = () => {
      // マップ背景（ワールド座標系）
      if (bgImage) {
        ctx.drawImage(bgImage, 0, 0, mapWidth, mapHeight);
      } else {
        ctx.fillStyle = "#020617";
        ctx.fillRect(0, 0, mapWidth, mapHeight);
      }

      // グリッド
      if (showGrid) {
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.lineWidth = 1;
        const gridSize = 50;

        for (let x = 0; x <= mapWidth; x += gridSize) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, mapHeight);
          ctx.stroke();
        }

        for (let y = 0; y <= mapHeight; y += gridSize) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(mapWidth, y);
          ctx.stroke();
        }

        ctx.restore();
      }

      const fadeDuration = 0.5;

      // --- ユニット ---
      for (const unit of units) {
        if (unit.timeline.length === 0) continue;

        const pos = getSmoothPosition(unit.timeline, currentTime);
        if (!pos) continue;

        const spawnTime = unit.timeline[0].t;
        const despawnTime = unit.timeline[unit.timeline.length - 1].t;

        const { visible, alpha, scale } = getSpawnState(
          currentTime,
          spawnTime,
          despawnTime,
          fadeDuration
        );
        if (!visible) continue;

        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.globalAlpha = alpha;
        ctx.scale(scale, scale);

        const cached = unitImages[unit.id];
        if (cached) {
          ctx.drawImage(cached, -16, -16, 32, 32);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, 10, 0, Math.PI * 2);
          ctx.fillStyle = unit.color;
          ctx.fill();
        }

        // 選択ハイライト（開発ビューのみ）
        if (enableSelection && selectedUnitId && selectedUnitId === unit.id) {
          ctx.save();
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(0, 0, 14, 0, Math.PI * 2);
          ctx.strokeStyle = "#facc15"; // yellow
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        }

        // 名前表示（上に固定）
        ctx.fillStyle = "#fff";
        ctx.font = "12px sans-serif";
        ctx.fillText(unit.name, 12, -14);

        ctx.restore();
      }

      // --- キャラ ---
      characters?.forEach((ch) => {
        if (ch.timeline.length === 0) return;

        const pos = getSmoothPosition(ch.timeline, currentTime);
        if (!pos) return;

        const spawnTime = ch.timeline[0].t;
        const despawnTime = ch.timeline[ch.timeline.length - 1].t;

        const { visible, alpha, scale } = getSpawnState(
          currentTime,
          spawnTime,
          despawnTime,
          fadeDuration
        );
        if (!visible) return;

        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.globalAlpha = alpha;
        ctx.scale(scale, scale);

        const cached = charImages[ch.id];
        if (cached) {
          ctx.drawImage(cached, -24, -24, 48, 48);
        } else {
          ctx.fillStyle = "#f97316";
          ctx.fillRect(-12, -12, 24, 24);
        }

        ctx.fillStyle = "#fbbf24";
        ctx.font = "13px sans-serif";
        ctx.fillText(ch.name, 12, -10);

        ctx.restore();
      });
    };

    // 画面クリア & 背景
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    if (viewMode === "camera") {
      const cam = getCameraAtTime(
        battle.camera,
        currentTime,
        mapWidth,
        mapHeight
      );

      ctx.save();
      // 画面中央を基準に
      ctx.translate(canvasWidth / 2, canvasHeight / 2);
      // マップ基準スケール × カメラズーム
      ctx.scale(baseScale * cam.zoom, baseScale * cam.zoom);
      // カメラ中心を原点に
      ctx.translate(-cam.x, -cam.y);

      drawWorld();

      ctx.restore();
    } else {
      // 全体表示モード：マップをフィット＆センタリング
      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(baseScale, baseScale);

      drawWorld();

      ctx.restore();
    }
  }, [
    battle,
    currentTime,
    viewMode,
    showGrid,
    bgImage,
    unitImages,
    charImages,
    selectedUnitId,
    enableSelection,
  ]);

  // ユニット選択（開発ビューのみ / mapモードのみ）
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!enableSelection || !onSelectUnit) return;
    if (viewMode !== "map") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const { map } = battle;
    const mapWidth = map.width;
    const mapHeight = map.height;

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    const scaleX = canvasWidth / mapWidth;
    const scaleY = canvasHeight / mapHeight;
    const baseScale = Math.min(scaleX, scaleY);
    const offsetX = (canvasWidth - mapWidth * baseScale) / 2;
    const offsetY = (canvasHeight - mapHeight * baseScale) / 2;

    // 画面座標 → マップ座標
    const worldX = (clickX - offsetX) / baseScale;
    const worldY = (clickY - offsetY) / baseScale;

    let nearestId: string | null = null;
    let nearestDistSq = Infinity;

    const fadeDuration = 0.5;

    for (const unit of battle.units) {
      if (unit.timeline.length === 0) continue;
      const pos = getSmoothPosition(unit.timeline, currentTime);
      if (!pos) continue;

      const spawnTime = unit.timeline[0].t;
      const despawnTime = unit.timeline[unit.timeline.length - 1].t;
      const { visible } = getSpawnState(
        currentTime,
        spawnTime,
        despawnTime,
        fadeDuration
      );
      if (!visible) continue;

      const dx = worldX - pos.x;
      const dy = worldY - pos.y;
      const distSq = dx * dx + dy * dy;

      const hitRadius = 20; // マップ座標系でのざっくり当たり判定
      if (distSq <= hitRadius * hitRadius && distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearestId = unit.id;
      }
    }

    onSelectUnit(nearestId);
  };

  return (
    <div className="w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" onClick={handleClick} />
    </div>
  );
};
