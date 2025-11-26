"use client";

import React, { useRef, useEffect, useState } from "react";
import type { BattleData, CameraTarget, RenderTransform } from "@/types/battle";
import { getCameraAtTime } from "./transform";
import { drawWorld } from "./drawWorld";
import { hitTestAtTime } from "./hitTest";
import { convertClickToWorld } from "@/utils/battle/convertClickToWorld";
import { focusCameraOn, prepareFrameState } from "./runtime";

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
  cameraTarget?: CameraTarget | null;
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
  cameraTarget = null,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const transformRef = useRef<RenderTransform | null>(null);

  // ★ 追加：現在の描画スケールを保持して hitTest に渡す用
  const cameraScaleRef = useRef(1);

  // ズーム関連
  const [userScale, setUserScale] = useState(1);

  // 強制再描画用
  const [, setTick] = useState(0);
  const forceRender = () => setTick((v) => v + 1);

  // ドラッグ移動
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });

  // 画像キャッシュ系 ------------------------------------------------
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [unitImages, setUnitImages] = useState<
    Record<string, HTMLImageElement>
  >({});
  const [charImages, setCharImages] = useState<
    Record<string, HTMLImageElement>
  >({});

  useEffect(() => {
    let active = true;
    if (!battle?.map?.image) {
      setTimeout(() => active && setBgImage(null), 0);
      return;
    }
    const img = new Image();
    img.src = battle.map.image;
    img.onload = () => active && setBgImage(img);
    return () => {
      active = false;
    };
  }, [battle?.map?.image]);

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

  // 描画本体 --------------------------------------------------------
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

    const baseScale = Math.min(
      canvasWidth / mapWidth,
      canvasHeight / mapHeight
    );
    const offsetX = (canvasWidth - mapWidth * baseScale) / 2;
    const offsetY = (canvasHeight - mapHeight * baseScale) / 2;

    const fadeDuration = 0.5;
    const frameState = prepareFrameState(battle, currentTime, fadeDuration);
    const resolvedTarget = cameraTarget ?? battle.cameraTarget ?? null;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    if (viewMode === "camera") {
      const rawCam = getCameraAtTime(
        battle.camera,
        currentTime,
        mapWidth,
        mapHeight
      );

      const baseCam = {
        t: 0,
        x: rawCam.x,
        y: rawCam.y,
        zoom: rawCam.zoom ?? 1,
      };

      const cam = focusCameraOn(battle, frameState, baseCam, resolvedTarget);
      const cameraScale = cam.zoom * userScale;

      // ★ 追加：現在のスケールを記録
      cameraScaleRef.current = cameraScale;

      transformRef.current = {
        mode: "camera",
        baseScale,
        canvasWidth,
        canvasHeight,
        mapWidth,
        mapHeight,
        cam,
        scaleFactor: cameraScale,
      };

      ctx.save();
      ctx.translate(canvasWidth / 2, canvasHeight / 2);
      ctx.translate(viewOffset.x, viewOffset.y);
      ctx.scale(baseScale * cameraScale, baseScale * cameraScale);
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
        selectedUnitId: selectedUnitId ?? null,
        selectedCharacterId: selectedCharacterId ?? null,
        enableSelection,
        cameraScale,
        frameState,
      });

      ctx.restore();
    } else {
      // map モード
      const cameraScale = userScale;

      // ★ 追加：mapモード時も記録
      cameraScaleRef.current = cameraScale;

      transformRef.current = {
        mode: "map",
        baseScale,
        offsetX,
        offsetY,
        canvasWidth,
        canvasHeight,
        mapWidth,
        mapHeight,
        scaleFactor: cameraScale,
      };

      ctx.save();
      ctx.translate(viewOffset.x, viewOffset.y);
      ctx.translate(offsetX, offsetY);
      ctx.scale(baseScale * cameraScale, baseScale * cameraScale);

      drawWorld({
        ctx,
        battle,
        currentTime,
        showGrid,
        bgImage,
        unitImages,
        charImages,
        fadeDuration,
        selectedUnitId: selectedUnitId ?? null,
        selectedCharacterId: selectedCharacterId ?? null,
        enableSelection,
        cameraScale,
        frameState,
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
    cameraTarget,
    userScale,
    viewOffset.x,
    viewOffset.y,
  ]);

  // battle null ----------------------------------------------------
  if (!battle) {
    return (
      <div className="w-full h-full bg-[#020617] flex items-center justify-center text-gray-400">
        戦闘データがありません
      </div>
    );
  }

  // クリック -------------------------------------------------------
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!battle || !enableSelection) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const transform = transformRef.current;
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
      cameraScale: cameraScaleRef.current ?? 1, // ← ここで参照
    });

    if (hit.characterId) return onSelectCharacter?.(hit.characterId);
    if (hit.unitId) return onSelectUnit?.(hit.unitId);

    onSelectUnit?.(null);
    onSelectCharacter?.(null);
  };

  // ホイールズーム ------------------------------------------------
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!battle) return;

    e.preventDefault();

    setUserScale((prev) => {
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      let next = prev * zoomFactor;
      if (next < 1) next = 1;
      if (next > 6) next = 6;
      return next;
    });

    forceRender();
  };

  // ドラッグ移動 ---------------------------------------------------
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;

    setViewOffset((prev) => ({
      x: prev.x + dx,
      y: prev.y + dy,
    }));

    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const stopDrag = () => {
    setIsDragging(false);
  };

  return (
    <div className="w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onClick={handleClick}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
      />
    </div>
  );
};
