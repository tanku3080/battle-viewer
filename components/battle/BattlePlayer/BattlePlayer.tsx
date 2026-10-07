"use client";

import React, { useEffect, useRef, useState } from "react";
import type { BattleData, CameraTarget, RenderTransform } from "@/types/battle";
import { getCameraAtTime } from "./transform";
import { drawWorld } from "./drawWorld";
import { hitTestAtTime } from "./hitTest";
import { convertClickToWorld } from "@/utils/battle/convertClickToWorld";
import { focusCameraOn, prepareFrameState } from "./runtime";
import {
  getFittedMapScreenCenter,
  getNextZoomScale,
  getVisibleWorldBoundsCentered,
} from "@/utils/battle/viewTransform";

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
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const unitImagesRef = useRef<Record<string, HTMLImageElement>>({});
  const charImagesRef = useRef<Record<string, HTMLImageElement>>({});
  const hierarchyImagesRef = useRef<Record<string, HTMLImageElement>>({});

  const [userScale, setUserScale] = useState(1);
  const cameraOverrideRef = useRef(false);
  const [assetVersion, setAssetVersion] = useState(0);
  const [resizeVersion, setResizeVersion] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    cameraOverrideRef.current = false;
  }, [battle, cameraTarget]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!parent) return;

    const observer = new ResizeObserver(() => {
      setResizeVersion((value) => value + 1);
    });

    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    bgImageRef.current = null;
    unitImagesRef.current = {};
    charImagesRef.current = {};
    hierarchyImagesRef.current = {};
    if (!battle) return;

    const loadImage = (
      src: string | null | undefined,
      onLoad: (image: HTMLImageElement) => void
    ) => {
      if (!src) return;
      const image = new Image();
      image.onload = () => {
        if (cancelled) return;
        onLoad(image);
        setAssetVersion((value) => value + 1);
      };
      image.onerror = () => {
        if (!cancelled) setAssetVersion((value) => value + 1);
      };
      image.src = src;
    };

    loadImage(battle.map.image, (image) => {
      bgImageRef.current = image;
    });

    battle.units.forEach((unit) => {
      loadImage(unit.icon, (image) => {
        unitImagesRef.current[unit.id] = image;
      });
    });

    battle.characters.forEach((character) => {
      loadImage(character.icon, (image) => {
        charImagesRef.current[character.id] = image;
      });
    });

    Object.values(battle.hierarchy?.nodes ?? {}).forEach((node) => {
      loadImage(node.icon, (image) => {
        hierarchyImagesRef.current[node.id] = image;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [battle]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !battle) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setUserScale((previous) => getNextZoomScale(previous, event.deltaY));
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [battle]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !battle) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const canvasWidth = parent.clientWidth;
    const canvasHeight = parent.clientHeight;
    if (canvasWidth <= 0 || canvasHeight <= 0) return;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width: mapWidth, height: mapHeight } = battle.map;
    const baseScale = Math.min(
      canvasWidth / mapWidth,
      canvasHeight / mapHeight
    );
    const offsetX = (canvasWidth - mapWidth * baseScale) / 2;
    const offsetY = (canvasHeight - mapHeight * baseScale) / 2;
    const fadeDuration = 0.5;
    const frameState = prepareFrameState(
      battle,
      currentTime,
      fadeDuration,
      cameraOverrideRef.current ? null : cameraTarget
    );

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (viewMode === "camera") {
      const rawCam = getCameraAtTime(
        battle.timeline.camera ?? [],
        currentTime,
        mapWidth,
        mapHeight
      );

      const baseCam = {
        t: currentTime,
        x: rawCam.x,
        y: rawCam.y,
        zoom: rawCam.zoom ?? 1,
      };

      const resolvedTarget = cameraOverrideRef.current ? null : cameraTarget;
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

      const screenCenter = getFittedMapScreenCenter({
        offsetX,
        offsetY,
        baseScale,
        mapWidth,
        mapHeight,
      });

      ctx.save();
      ctx.translate(screenCenter.x, screenCenter.y);
      ctx.translate(viewOffset.x, viewOffset.y);
      ctx.scale(scaleFactor, scaleFactor);
      ctx.translate(-cam.x, -cam.y);

      const gridBounds = getVisibleWorldBoundsCentered({
        canvasWidth,
        canvasHeight,
        offsetX,
        offsetY,
        baseScale,
        mapWidth,
        mapHeight,
        viewOffsetX: viewOffset.x,
        viewOffsetY: viewOffset.y,
        scaleFactor,
        worldCenterX: cam.x,
        worldCenterY: cam.y,
      });

      drawWorld({
        ctx,
        battle,
        currentTime,
        showGrid,
        viewMode,
        gridBounds,
        fadeDuration,
        cameraScale: scaleFactor,
        frameState,
        selectedUnitId,
        selectedCharacterId,
        enableSelection,
        bgImage: bgImageRef.current,
        unitImages: unitImagesRef.current,
        charImages: charImagesRef.current,
        hierarchyImages: hierarchyImagesRef.current,
      });

      ctx.restore();
      return;
    }

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

    const mapCenter = { x: mapWidth / 2, y: mapHeight / 2 };
    const screenCenter = getFittedMapScreenCenter({
      offsetX,
      offsetY,
      baseScale,
      mapWidth,
      mapHeight,
    });

    ctx.save();
    ctx.translate(screenCenter.x, screenCenter.y);
    ctx.translate(viewOffset.x, viewOffset.y);
    ctx.scale(scaleFactor, scaleFactor);
    ctx.translate(-mapCenter.x, -mapCenter.y);

    const gridBounds = getVisibleWorldBoundsCentered({
      canvasWidth,
      canvasHeight,
      offsetX,
      offsetY,
      baseScale,
      mapWidth,
      mapHeight,
      viewOffsetX: viewOffset.x,
      viewOffsetY: viewOffset.y,
      scaleFactor,
      worldCenterX: mapCenter.x,
      worldCenterY: mapCenter.y,
    });

    drawWorld({
      ctx,
      battle,
      currentTime,
      showGrid,
      viewMode,
      gridBounds,
      fadeDuration,
      cameraScale: scaleFactor,
      frameState,
      selectedUnitId,
      selectedCharacterId,
      enableSelection,
      bgImage: bgImageRef.current,
      unitImages: unitImagesRef.current,
      charImages: charImagesRef.current,
      hierarchyImages: hierarchyImagesRef.current,
    });

    ctx.restore();
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
     assetVersion,
    resizeVersion,
  ]);

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!battle || !enableSelection || isDragging) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const transform = transformRef.current;
    if (!transform) return;

    const { worldX, worldY } = convertClickToWorld(
      event.clientX - rect.left,
      event.clientY - rect.top,
      transform
    );

    const hit = hitTestAtTime({
      battle,
      currentTime,
      worldX,
      worldY,
      fadeDuration: 0.5,
      cameraScale: cameraScaleRef.current,
    });

    if (hit.unitId) {
      onSelectUnit?.(hit.unitId);
      return;
    }

    if (hit.characterId) {
      onSelectCharacter?.(hit.characterId);
      return;
    }

    onSelectUnit?.(null);
    onSelectCharacter?.(null);
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(false);
    dragStart.current = { x: event.clientX, y: event.clientY };
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (event.buttons !== 1) return;

    const dx = event.clientX - dragStart.current.x;
    const dy = event.clientY - dragStart.current.y;
    if (dx === 0 && dy === 0) return;

    setIsDragging(true);
    cameraOverrideRef.current = true;
    setViewOffset((previous) => ({
      x: previous.x + dx,
      y: previous.y + dy,
    }));
    dragStart.current = { x: event.clientX, y: event.clientY };
  };

  const stopDrag = () => {
    window.setTimeout(() => setIsDragging(false), 0);
  };

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
