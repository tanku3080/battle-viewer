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
import { useI18n } from "@/i18n/I18nProvider";

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
  const { t } = useI18n();
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
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const dragStart = useRef({ x: 0, y: 0 });
  const pinchDistanceRef = useRef<number | null>(null);
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

  const getPointerDistance = () => {
    const points = [...pointersRef.current.values()];
    if (points.length < 2) return null;
    const [a, b] = points;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    setIsDragging(false);

    if (pointersRef.current.size === 1) {
      dragStart.current = { x: event.clientX, y: event.clientY };
      pinchDistanceRef.current = null;
      return;
    }

    pinchDistanceRef.current = getPointerDistance();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const previousPointer = pointersRef.current.get(event.pointerId);
    if (!previousPointer) return;

    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (pointersRef.current.size >= 2) {
      const distance = getPointerDistance();
      const previousDistance = pinchDistanceRef.current;

      if (
        distance !== null &&
        previousDistance !== null &&
        Math.abs(distance - previousDistance) >= 2
      ) {
        setIsDragging(true);
        cameraOverrideRef.current = true;
        setUserScale((previous) =>
          getNextZoomScale(
            previous,
            distance > previousDistance ? -120 : 120,
            0.05
          )
        );
      }

      pinchDistanceRef.current = distance;
      return;
    }

    const dx = event.clientX - previousPointer.x;
    const dy = event.clientY - previousPointer.y;
    if (dx === 0 && dy === 0) return;

    setIsDragging(true);
    cameraOverrideRef.current = true;
    setViewOffset((previous) => ({
      x: previous.x + dx,
      y: previous.y + dy,
    }));
    dragStart.current = { x: event.clientX, y: event.clientY };
  };

  const stopPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    pinchDistanceRef.current =
      pointersRef.current.size >= 2 ? getPointerDistance() : null;

    if (pointersRef.current.size === 1) {
      const [point] = pointersRef.current.values();
      dragStart.current = point;
    }

    window.setTimeout(() => setIsDragging(false), 0);
  };

  const panView = (dx: number, dy: number) => {
    cameraOverrideRef.current = true;
    setViewOffset((previous) => ({
      x: previous.x + dx,
      y: previous.y + dy,
    }));
  };

  const zoomView = (direction: "in" | "out") => {
    setUserScale((previous) =>
      getNextZoomScale(previous, direction === "in" ? -120 : 120)
    );
  };

  const resetView = () => {
    cameraOverrideRef.current = false;
    setUserScale(1);
    setViewOffset({ x: 0, y: 0 });
  };

  const handleCanvasKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const panStep = 32;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      panView(panStep, 0);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      panView(-panStep, 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      panView(0, panStep);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      panView(0, -panStep);
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomView("in");
    } else if (event.key === "-") {
      event.preventDefault();
      zoomView("out");
    } else if (event.key === "0" || event.key === "Home") {
      event.preventDefault();
      resetView();
    }
  };

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none cursor-grab active:cursor-grabbing"
        tabIndex={0}
        aria-label={t("canvas.touchHelp")}
        onKeyDown={handleCanvasKeyDown}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopPointer}
        onPointerCancel={stopPointer}
      />
    </div>
  );
};
