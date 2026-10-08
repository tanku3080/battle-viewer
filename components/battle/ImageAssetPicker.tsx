"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useI18n } from "@/i18n/I18nProvider";

type Props = {
  label: string;
  value: string;
  aspectRatio: number;
  mode: "icon" | "map";
  onChange: (value: string) => void;
  compact?: boolean;
};

type ImageSize = { width: number; height: number };

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function ImageAssetPicker({
  label,
  value,
  aspectRatio,
  mode,
  onChange,
  compact = false,
}: Props) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const titleId = useId();
  const helpId = useId();
  const [source, setSource] = useState("");
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState("");

  const safeAspect = Math.max(0.1, aspectRatio);
  const maxPreviewWidth = mode === "icon" ? 360 : 520;
  const maxPreviewHeight = 360;
  const previewSize = useMemo(() => {
    const boxAspect = maxPreviewWidth / maxPreviewHeight;
    if (safeAspect >= boxAspect) {
      return {
        width: maxPreviewWidth,
        height: maxPreviewWidth / safeAspect,
      };
    }
    return {
      width: maxPreviewHeight * safeAspect,
      height: maxPreviewHeight,
    };
  }, [maxPreviewHeight, maxPreviewWidth, safeAspect]);
  const previewWidth = previewSize.width;
  const previewHeight = previewSize.height;
  const iconCropSize =
    mode === "icon" ? Math.min(previewWidth, previewHeight) * 0.82 : null;
  const cropWidth = iconCropSize ?? previewWidth;
  const cropHeight = iconCropSize ?? previewHeight;

  const baseScale = useMemo(() => {
    if (!imageSize) return 1;
    return Math.max(
      cropWidth / imageSize.width,
      cropHeight / imageSize.height
    );
  }, [cropHeight, cropWidth, imageSize]);

  const clampOffset = (next: { x: number; y: number }, nextZoom = zoom) => {
    if (!imageSize) return next;
    const renderedWidth = imageSize.width * baseScale * nextZoom;
    const renderedHeight = imageSize.height * baseScale * nextZoom;
    const maxX = Math.max(0, (renderedWidth - cropWidth) / 2);
    const maxY = Math.max(0, (renderedHeight - cropHeight) / 2);
    return {
      x: clamp(next.x, -maxX, maxX),
      y: clamp(next.y, -maxY, maxY),
    };
  };

  useEffect(() => {
    if (!source) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
      previousFocus?.focus();
    };
  }, [source]);

  const openFileDialog = () => inputRef.current?.click();

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError(t("image.invalidType"));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(t("image.tooLarge"));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setSource(reader.result);
      setImageSize(null);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setError("");
    };
    reader.onerror = () => setError(t("image.readFailed"));
    reader.readAsDataURL(file);
  };

  const nudge = (x: number, y: number) => {
    setOffset((current) =>
      clampOffset({ x: current.x + x, y: current.y + y })
    );
  };

  const handlePreviewKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 20 : 5;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      nudge(-step, 0);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      nudge(step, 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      nudge(0, -step);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      nudge(0, step);
    }
  };

  const commit = () => {
    const image = imageRef.current;
    if (!image || !imageSize) return;

    const scale = baseScale * zoom;
    const sourceWidth = cropWidth / scale;
    const sourceHeight = cropHeight / scale;
    const sourceX = imageSize.width / 2 - sourceWidth / 2 - offset.x / scale;
    const sourceY = imageSize.height / 2 - sourceHeight / 2 - offset.y / scale;

    const outputWidth =
      mode === "icon"
        ? 256
        : Math.max(1, Math.min(1600, Math.round(previewWidth * 3)));
    const outputHeight = Math.max(1, Math.round(outputWidth / aspectRatio));
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      outputWidth,
      outputHeight
    );

    onChange(
      canvas.toDataURL(mode === "map" ? "image/jpeg" : "image/png", 0.9)
    );
    setSource("");
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        aria-label={t("image.chooseFile", { label })}
        onChange={(event) => {
          handleFile(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />

      {compact ? (
        <button
          type="button"
          onClick={openFileDialog}
          title={t("image.chooseTitle", { label })}
          className="h-10 min-w-24 overflow-hidden rounded border border-gray-600 bg-[#111827] px-2 text-xs hover:border-blue-400"
        >
          {value ? (
            <span className="flex items-center gap-2">
              <img src={value} alt="" className="h-7 w-10 rounded object-cover" />
              {t("image.change")}
            </span>
          ) : (
            t("image.choose", { label })
          )}
        </button>
      ) : (
        <div className="mb-3">
          <span className="mb-1 block text-xs text-gray-300">{label}</span>
          <button
            type="button"
            onClick={openFileDialog}
            className="flex w-full items-center gap-3 rounded border border-gray-600 bg-[#111827] p-2 text-left hover:border-blue-400"
          >
            {value ? (
              <img
                src={value}
                alt=""
                className={
                  "h-16 w-16 shrink-0 object-cover " +
                  (mode === "icon" ? "rounded-full" : "rounded")
                }
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-dashed border-gray-500 text-2xl text-gray-300"
              >
                +
              </span>
            )}
            <span className="text-sm">
              {value ? t("image.changeImage") : t("image.chooseImage")}
              <span className="mt-1 block text-[11px] text-gray-300">
                {t("image.adjustHint")}
              </span>
            </span>
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="mt-2 min-h-8 text-xs text-red-300 hover:text-red-200"
            >
              {t("image.remove")}
            </button>
          )}
          {error && (
            <p role="alert" className="mt-1 text-xs text-red-300">
              {error}
            </p>
          )}
        </div>
      )}

      {source && (
        <dialog
          ref={dialogRef}
          aria-labelledby={titleId}
          aria-describedby={helpId}
          onCancel={(event) => {
            event.preventDefault();
            setSource("");
          }}
          className="m-auto max-h-[95vh] max-w-[min(48rem,95vw)] overflow-auto rounded-xl border border-gray-700 bg-[#0b1020] p-5 text-gray-100 shadow-2xl backdrop:bg-black/80"
        >
          <h2 id={titleId} className="text-lg font-semibold">
            {t("image.preview", { label })}
          </h2>
          <p id={helpId} className="mt-1 text-xs text-gray-300">
            {mode === "icon"
              ? t("image.iconHelp")
              : t("image.mapHelp")}
          </p>

          <div className="mt-4 flex justify-center">
            <div
              role="group"
              aria-label={t("image.positionGroup", { label })}
              tabIndex={0}
              className="relative touch-none overflow-hidden border-2 border-blue-500 bg-black"
              style={{ width: previewWidth, height: previewHeight }}
              onKeyDown={handlePreviewKeyDown}
              onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                dragRef.current = {
                  x: event.clientX,
                  y: event.clientY,
                  ox: offset.x,
                  oy: offset.y,
                };
              }}
              onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
                if (!dragRef.current) return;
                const next = {
                  x: dragRef.current.ox + event.clientX - dragRef.current.x,
                  y: dragRef.current.oy + event.clientY - dragRef.current.y,
                };
                setOffset(clampOffset(next));
              }}
              onPointerUp={() => {
                dragRef.current = null;
              }}
              onPointerCancel={() => {
                dragRef.current = null;
              }}
            >
              <img
                ref={imageRef}
                src={source}
                alt={t("image.adjustingAlt")}
                draggable={false}
                onLoad={(event) => {
                  setImageSize({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  });
                }}
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                style={
                  imageSize
                    ? {
                        width: imageSize.width * baseScale * zoom,
                        height: imageSize.height * baseScale * zoom,
                        transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                      }
                    : undefined
                }
              />
              {mode === "icon" ? (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-1/2 rounded-full border-2 border-white/90"
                  style={{
                    width: iconCropSize ?? undefined,
                    height: iconCropSize ?? undefined,
                    transform: "translate(-50%, -50%)",
                    boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
                  }}
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 border border-white/40"
                />
              )}
            </div>
          </div>

          <div
            className="mx-auto mt-3 grid w-fit grid-cols-3 gap-2"
            role="group"
            aria-label={t("image.buttonGroup")}
          >
            <span />
            <button type="button" className="h-10 min-w-10 rounded bg-gray-700 px-3 hover:bg-gray-600" onClick={() => nudge(0, -5)} aria-label={t("image.up")}>↑</button>
            <span />
            <button type="button" className="h-10 min-w-10 rounded bg-gray-700 px-3 hover:bg-gray-600" onClick={() => nudge(-5, 0)} aria-label={t("image.left")}>←</button>
            <button type="button" className="h-10 min-w-10 rounded bg-gray-700 px-3 hover:bg-gray-600" onClick={() => setOffset({ x: 0, y: 0 })} aria-label={t("image.centerAria")}>{t("image.center")}</button>
            <button type="button" className="h-10 min-w-10 rounded bg-gray-700 px-3 hover:bg-gray-600" onClick={() => nudge(5, 0)} aria-label={t("image.right")}>→</button>
            <span />
            <button type="button" className="h-10 min-w-10 rounded bg-gray-700 px-3 hover:bg-gray-600" onClick={() => nudge(0, 5)} aria-label={t("image.down")}>↓</button>
            <span />
          </div>

          <label className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <span>{t("image.zoom")}</span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              aria-valuetext={t("image.zoomValue", { zoom: zoom.toFixed(2) })}
              onChange={(event) => {
                const nextZoom = Number(event.target.value);
                setZoom(nextZoom);
                setOffset((current) => clampOffset(current, nextZoom));
              }}
              className="w-72 max-w-full"
            />
            <span>{zoom.toFixed(2)}x</span>
          </label>

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSource("")}
              className="rounded bg-gray-600 px-4 py-2 hover:bg-gray-500"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              disabled={!imageSize}
              onClick={commit}
              className="rounded bg-blue-600 px-4 py-2 hover:bg-blue-700 disabled:opacity-40"
            >
              {t("common.confirm")}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
