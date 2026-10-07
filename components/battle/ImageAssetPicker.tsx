"use client";

import { PointerEvent, useMemo, useRef, useState } from "react";

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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [source, setSource] = useState("");
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState("");

  const previewWidth = mode === "icon" ? 360 : 520;
  const previewHeight = previewWidth / Math.max(0.2, aspectRatio);

  const baseScale = useMemo(() => {
    if (!imageSize) return 1;
    return Math.max(
      previewWidth / imageSize.width,
      previewHeight / imageSize.height
    );
  }, [imageSize, previewHeight, previewWidth]);

  const clampOffset = (next: { x: number; y: number }, nextZoom = zoom) => {
    if (!imageSize) return next;
    const renderedWidth = imageSize.width * baseScale * nextZoom;
    const renderedHeight = imageSize.height * baseScale * nextZoom;
    return {
      x: clamp(next.x, -(renderedWidth - previewWidth) / 2, (renderedWidth - previewWidth) / 2),
      y: clamp(next.y, -(renderedHeight - previewHeight) / 2, (renderedHeight - previewHeight) / 2),
    };
  };

  const openFileDialog = () => inputRef.current?.click();

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("PNG / JPEG / WebP画像を選択してください。");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("画像ファイルは10MB以下にしてください。");
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
    reader.onerror = () => setError("画像を読み込めませんでした。");
    reader.readAsDataURL(file);
  };

  const commit = () => {
    const image = imageRef.current;
    if (!image || !imageSize) return;

    const scale = baseScale * zoom;
    const sourceWidth = previewWidth / scale;
    const sourceHeight = previewHeight / scale;
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
        onChange={(event) => {
          handleFile(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />

      {compact ? (
        <button
          type="button"
          onClick={openFileDialog}
          title={label + "を選択"}
          className="h-10 min-w-24 overflow-hidden rounded border border-gray-600 bg-[#111827] px-2 text-xs hover:border-blue-400"
        >
          {value ? (
            <span className="flex items-center gap-2">
              <img src={value} alt="" className="h-7 w-10 rounded object-cover" />
              変更
            </span>
          ) : (
            label + "選択"
          )}
        </button>
      ) : (
        <div className="mb-3">
          <span className="mb-1 block text-xs text-gray-400">{label}</span>
          <button
            type="button"
            onClick={openFileDialog}
            className="flex w-full items-center gap-3 rounded border border-gray-600 bg-[#111827] p-2 text-left hover:border-blue-400"
          >
            {value ? (
              <img src={value} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />
            ) : (
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-dashed border-gray-600 text-2xl text-gray-500">
                +
              </span>
            )}
            <span className="text-sm">
              {value ? "画像を変更" : "画像を選択"}
              <span className="mt-1 block text-[11px] text-gray-500">
                選択後に位置とズームを調整できます。
              </span>
            </span>
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="mt-2 text-xs text-red-400 hover:text-red-300"
            >
              画像を削除
            </button>
          )}
          {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
        </div>
      )}

      {source && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-6">
          <div className="max-h-full max-w-3xl overflow-auto rounded-xl border border-gray-700 bg-[#0b1020] p-5 shadow-2xl">
            <h2 className="text-lg font-semibold">{label}プレビュー</h2>
            <p className="mt-1 text-xs text-gray-400">
              画像をドラッグして位置を調整し、ズームで表示範囲を決めてください。
            </p>

            <div className="mt-4 flex justify-center">
              <div
                className="relative touch-none overflow-hidden border-2 border-blue-500 bg-black"
                style={{ width: previewWidth, height: previewHeight }}
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
                  alt="調整中"
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
                <div className="pointer-events-none absolute inset-0 border border-white/40" />
              </div>
            </div>

            <label className="mt-4 flex items-center gap-3 text-sm">
              ズーム
              <input
                type="range"
                min={1}
                max={4}
                step={0.01}
                value={zoom}
                onChange={(event) => {
                  const nextZoom = Number(event.target.value);
                  setZoom(nextZoom);
                  setOffset((current) => clampOffset(current, nextZoom));
                }}
                className="w-72"
              />
              <span>{zoom.toFixed(2)}x</span>
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSource("")}
                className="rounded bg-gray-600 px-4 py-2 hover:bg-gray-500"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={!imageSize}
                onClick={commit}
                className="rounded bg-blue-600 px-4 py-2 hover:bg-blue-700 disabled:opacity-40"
              >
                決定
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
