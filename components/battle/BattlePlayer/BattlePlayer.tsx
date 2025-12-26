"use client";

import React, { useRef, useEffect, useState } from "react";
import type { BattleData, CameraTarget } from "@/types/battle";
import { RenderTransform } from "@/types/battle";
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
  const cameraScaleRef = useRef(1);

  const [userScale, setUserScale] = useState(1);
  const [cameraOverride, setCameraOverride] = useState(false);

  const [, setTick] = useState(0);
  const forceRender = () => setTick((v) => v + 1);

  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });

  /* ================= ホイールズーム ================= */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !battle) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      const delta = Math.sign(e.deltaY);
      const step = 0.1;

      setUserScale((prev) => {
        const next = prev + (delta > 0 ? -step : step);
        if (next < 1) return 1;
        if (next > 5) return 5;
        return next;
      });

      forceRender();
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [battle]);

  /* ================= 描画処理（省略なし） ================= */
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
    const resolvedTarget = cameraOverride ? cameraTarget : null;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (viewMode === "camera") {
      const rawCam = getCameraAtTime(
        battle.timeline.camera ?? [],
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
      const scaleFactor = baseScale * cam.zoom * userScale;

      cameraScaleRef.current = scaleFactor;

      transformRef.current = {
        mode: "camera",
        baseScale,
        offsetX,
        offsetY,
        canvasWidth,
        canvasHeight,
        mapWidth,
        mapHeight,
        cam,
        viewOffsetX: viewOffset.x,
        viewOffsetY: viewOffset.y,
        scaleFactor,
      };

      ctx.save();
      // contain(offset) + mapCenter を基準に統一（canvasCenter と等価）
      ctx.translate(offsetX, offsetY);
      ctx.translate((mapWidth * baseScale) / 2, (mapHeight * baseScale) / 2);
      ctx.translate(viewOffset.x, viewOffset.y);
      ctx.scale(scaleFactor, scaleFactor);
      ctx.translate(-cam.x, -cam.y);

      drawWorld({
        ctx,
        battle,
        currentTime,
        showGrid,
        fadeDuration,
        cameraScale: scaleFactor,
        frameState,
        selectedUnitId,
        selectedCharacterId,
        enableSelection,
        bgImage: null,
        unitImages: {},
        charImages: {},
      });

      ctx.restore();
    } else {
      const scaleFactor = baseScale * userScale;
      cameraScaleRef.current = scaleFactor;

      transformRef.current = {
        mode: "map",
        baseScale,
        offsetX,
        offsetY,
        canvasWidth,
        canvasHeight,
        mapWidth,
        mapHeight,
        viewOffsetX: viewOffset.x,
        viewOffsetY: viewOffset.y,
        scaleFactor,
      };

      ctx.save();
      ctx.translate(viewOffset.x, viewOffset.y);
      ctx.translate(offsetX, offsetY);
      ctx.scale(scaleFactor, scaleFactor);

      drawWorld({
        ctx,
        battle,
        currentTime,
        showGrid,
        fadeDuration,
        cameraScale: scaleFactor,
        frameState,
        selectedUnitId,
        selectedCharacterId,
        enableSelection,
        bgImage: null,
        unitImages: {},
        charImages: {},
      });

      ctx.restore();
    }
  }, [
    battle,
    currentTime,
    viewMode,
    showGrid,
    userScale,
    viewOffset.x,
    viewOffset.y,
    selectedUnitId,
    selectedCharacterId,
    enableSelection,
    cameraTarget,
    cameraOverride,
  ]);

  /* ================= クリック選択 ================= */
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!battle) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const tr = transformRef.current;
    if (!tr) return;

    const { worldX, worldY } = convertClickToWorld(clickX, clickY, tr);

    const hit = hitTestAtTime({
      battle,
      currentTime,
      worldX,
      worldY,
      fadeDuration: 0.5,
      cameraScale: cameraScaleRef.current,
    });

    // 優先：Unit → Character（仕様要件に合わせる）
    if (hit.unitId) onSelectUnit?.(hit.unitId);
    else if (hit.characterId) onSelectCharacter?.(hit.characterId);
    else {
      onSelectUnit?.(null);
      onSelectCharacter?.(null);
    }
  };

  /* ================= ドラッグ ================= */
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setCameraOverride(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;

    setViewOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const stopDrag = () => setIsDragging(false);

  return (
    <div className="w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
      />
    </div>
  );
};
