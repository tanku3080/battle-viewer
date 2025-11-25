"use client";

import React, { useRef, useEffect, useState } from "react";
import type { BattleData } from "@/types/battle";
import { getCameraAtTime } from "./transform";
import { drawWorld } from "./drawWorld";
import { hitTestAtTime } from "./hitTest";
import { convertClickToWorld } from "@/utils/battle/convertClickToWorld";

type RenderTransform =
  | {
      mode: "map";
      baseScale: number;
      offsetX: number;
      offsetY: number;
      canvasWidth: number;
      canvasHeight: number;
      mapWidth: number;
      mapHeight: number;
    }
  | {
      mode: "camera";
      baseScale: number;
      canvasWidth: number;
      canvasHeight: number;
      mapWidth: number;
      mapHeight: number;
      cam: { x: number; y: number; zoom: number };
    };

type Props = {
  battle: BattleData | null;
  currentTime: number;
  viewMode: "map" | "camera";
  showGrid: boolean;
  selectedUnitId?: string | null;
  onSelectUnit?: (id: string | null) => void;
  selectedCharacterId?: string | null;
  onSelectCharacter?: (id: string | null) => void;
  enableSelection?: boolean;
};

export const BattlePlayer: React.FC<Props> = ({
  battle,
  currentTime,
  viewMode,
  showGrid,
  selectedUnitId,
  onSelectUnit,
  selectedCharacterId,
  onSelectCharacter,
  enableSelection = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const transformRef = useRef<RenderTransform | null>(null);

  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [unitImages, setUnitImages] = useState<
    Record<string, HTMLImageElement>
  >({});
  const [charImages, setCharImages] = useState<
    Record<string, HTMLImageElement>
  >({});

  // 背景画像キャッシュ
  useEffect(() => {
    let active = true;

    if (!battle?.map?.image) {
      // 完全非同期に飛ばすことで strict-mode 警告回避
      setTimeout(() => {
        if (active) setBgImage(null);
      }, 0);
      return;
    }

    const img = new Image();
    img.src = battle.map.image;

    img.onload = () => {
      setTimeout(() => {
        if (active) setBgImage(img);
      }, 0);
    };

    return () => {
      active = false;
    };
  }, [battle?.map?.image]);

  // ユニット画像
  useEffect(() => {
    battle?.units?.forEach((u) => {
      if (!u.icon) return;
      const img = new Image();
      img.src = u.icon;
      img.onload = () =>
        setUnitImages((prev) => ({
          ...prev,
          [u.id]: img,
        }));
    });
  }, [battle?.units]);

  // キャラ画像
  useEffect(() => {
    battle?.characters?.forEach((c) => {
      const img = new Image();
      img.src = c.icon;
      img.onload = () =>
        setCharImages((prev) => ({
          ...prev,
          [c.id]: img,
        }));
    });
  }, [battle?.characters]);

  // 描画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !battle) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const canvasWidth = parent.clientWidth;
    const canvasHeight = parent.clientHeight;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const map = battle.map;
    if (!map) return;

    const mapWidth = map.width;
    const mapHeight = map.height;

    const scaleX = canvasWidth / mapWidth;
    const scaleY = canvasHeight / mapHeight;
    const baseScale = Math.min(scaleX, scaleY);
    const offsetX = (canvasWidth - mapWidth * baseScale) / 2;
    const offsetY = (canvasHeight - mapHeight * baseScale) / 2;

    const fadeDuration = 0.5;

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

      transformRef.current = {
        mode: "camera",
        baseScale,
        canvasWidth,
        canvasHeight,
        mapWidth,
        mapHeight,
        cam,
      };

      ctx.save();
      ctx.translate(canvasWidth / 2, canvasHeight / 2);
      ctx.scale(baseScale * cam.zoom, baseScale * cam.zoom);
      ctx.translate(-cam.x, -cam.y);

      drawWorld({
        ctx,
        battle,
        currentTime,
        showGrid,
        bgImage,
        unitImages,
        charImages,
        fadeDuration,
        selectedUnitId,
        selectedCharacterId,
        enableSelection,
      });

      ctx.restore();
    } else {
      transformRef.current = {
        mode: "map",
        baseScale,
        offsetX,
        offsetY,
        canvasWidth,
        canvasHeight,
        mapWidth,
        mapHeight,
      };

      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(baseScale, baseScale);

      drawWorld({
        ctx,
        battle,
        currentTime,
        showGrid,
        bgImage,
        unitImages,
        charImages,
        fadeDuration,
        selectedUnitId,
        selectedCharacterId,
        enableSelection,
      });

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
    selectedCharacterId,
    enableSelection,
  ]);

  // ① battle が null の場合は空画面だけ返す
  if (!battle) {
    return (
      <div className="w-full h-full bg-[#020617] flex items-center justify-center text-gray-400">
        戦闘データがありません
      </div>
    );
  }

  // クリック選択
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!battle || !enableSelection) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const transform = transformRef.current as RenderTransform;
    if (!transform) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const { worldX, worldY } = convertClickToWorld(clickX, clickY, transform);

    const hit = hitTestAtTime({
      battle,
      currentTime,
      worldX,
      worldY,
      fadeDuration: 0.5,
    });

    if (hit.characterId) {
      onSelectCharacter?.(hit.characterId);
      return;
    }

    if (hit.unitId) {
      onSelectUnit?.(hit.unitId);
      return;
    }

    // 何もヒットしてないときだけ null にする
    onSelectUnit?.(null);
    onSelectCharacter?.(null);
  };

  return (
    <div className="w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" onClick={handleClick} />
    </div>
  );
};
