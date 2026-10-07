"use client";

import Link from "next/link";
import { DragEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  getCreatorCameraAt,
  getCreatorElementVisualState,
  getCreatorPositionAt,
} from "@/utils/battleCreator/timeline";
import { hasMissingRequiredFields } from "@/utils/battleCreator/validation";
import {
  canCreatorHaveManualParent,
  canCreatorParent,
  expectedCreatorParentType,
  isCreatorBattleRootOnly,
} from "@/utils/battleCreator/hierarchy";

type SpatialType =
  | "unit"
  | "character"
  | "legion"
  | "corps"
  | "division"
  | "regiment"
  | "camera";
type SidebarTab = "elements" | "hierarchy";
type Point = { t: number; x: number; y: number; dir?: number; zoom?: number };
type EditorItem = {
  key: string;
  type: SpatialType;
  id: string;
  name: string;
  force: string;
  color: string;
  icon: string;
  parentId: string;
  x: number;
  y: number;
  zoom: number;
  dir: number;
  appearAt: number;
  destroyEnabled: boolean;
  destroyAt: number;
  timeline: Point[];
};

const PALETTE: Array<{
  type: SpatialType;
  label: string;
  mark: string;
  tooltip: string;
}> = [
  {
    type: "unit",
    label: "Unit",
    mark: "●",
    tooltip: "兵士・車両・航空機など、timelineで移動する最小戦闘単位を配置します。",
  },
  {
    type: "character",
    label: "Character",
    mark: "◆",
    tooltip: "指揮官など、軍事階層から独立したキャラクターを配置します。",
  },
  {
    type: "legion",
    label: "Legion",
    mark: "L",
    tooltip: "戦場全体を束ねる最上位の軍勢を配置します。",
  },
  {
    type: "corps",
    label: "Corps",
    mark: "C",
    tooltip: "Legion配下の軍団を配置します。",
  },
  {
    type: "division",
    label: "Division",
    mark: "D",
    tooltip: "Corps配下の師団を配置します。",
  },
  {
    type: "regiment",
    label: "Regiment",
    mark: "R",
    tooltip: "Division配下でUnitを束ねる連隊を配置します。",
  },
  {
    type: "camera",
    label: "Camera",
    mark: "◎",
    tooltip: "カメラ中心座標と描画範囲を設定します。赤い四角が現在の描画範囲です。",
  },
];

const HIERARCHY_TYPES: SpatialType[] = [
  "legion",
  "corps",
  "division",
  "regiment",
];

function isHierarchy(type: SpatialType) {
  return HIERARCHY_TYPES.includes(type);
}

function emptyItem(type: SpatialType): EditorItem {
  return {
    key: crypto.randomUUID(),
    type,
    id: "",
    name: "",
    force: "",
    color: "",
    icon: "",
    parentId: "",
    x: Number.NaN,
    y: Number.NaN,
    zoom: Number.NaN,
    dir: Number.NaN,
    appearAt: Number.NaN,
    destroyEnabled: false,
    destroyAt: Number.NaN,
    timeline: [],
  };
}

export default function BattleCreator() {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("elements");
  const [title, setTitle] = useState("バトル");
  const [mapImage, setMapImage] = useState("");
  const [mapWidth, setMapWidth] = useState(1200);
  const [mapHeight, setMapHeight] = useState(700);
  const [duration, setDuration] = useState(60);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [items, setItems] = useState<EditorItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draftItem, setDraftItem] = useState<EditorItem | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [validationDialog, setValidationDialog] = useState<
    "preview" | "save" | null
  >(null);
  const [showValidationErrors, setShowValidationErrors] = useState(false);

  const invalidItems = useMemo(
    () => items.filter((item) => hasMissingRequiredFields(item)),
    [items]
  );
  const hasInvalidItems = invalidItems.length > 0;

  const selectedSource =
    items.find((item) => item.key === selectedKey) ?? draftItem ?? null;

  const selected =
    selectedSource && selectedKey && !isHierarchy(selectedSource.type)
      ? {
          ...selectedSource,
          ...getCreatorPositionAt(
            selectedSource.timeline,
            currentTime,
            { x: selectedSource.x, y: selectedSource.y }
          ),
        }
      : selectedSource;

  const toLogical = (clientX: number, clientY: number) => {
    const rect = editorRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const rx = ((clientX - rect.left) / rect.width) * mapWidth;
    const ry = ((clientY - rect.top) / rect.height) * mapHeight;
    return {
      x: Math.round(rx - mapWidth / 2),
      y: Math.round(mapHeight / 2 - ry),
    };
  };

  const toPercent = (x: number, y: number) => {
    const ix = x + mapWidth / 2;
    const iy = mapHeight / 2 - y;
    return {
      left: String((ix / mapWidth) * 100) + "%",
      top: String((iy / mapHeight) * 100) + "%",
    };
  };

  useEffect(() => {
    if (!isPlaying) return;

    let frame = 0;
    let previous = performance.now();

    const tick = (now: number) => {
      const delta = (now - previous) / 1000;
      previous = now;

      setCurrentTime((value) => {
        const next = value + delta;
        if (next >= duration) {
          setIsPlaying(false);
          return duration;
        }
        return next;
      });

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, isPlaying]);

  const selectPalette = (type: SpatialType) => {
    setSelectedKey(null);
    setDraftItem(emptyItem(type));
  };

  const paletteDrag = (
    event: DragEvent<HTMLButtonElement>,
    type: SpatialType
  ) => {
    event.dataTransfer.setData("application/x-battle-palette", type);
    event.dataTransfer.effectAllowed = "copy";
    if (!draftItem || draftItem.type !== type) {
      selectPalette(type);
    }
  };

  const record = (item: EditorItem, x: number, y: number) => {
    const appearAt = Number.isFinite(item.appearAt)
      ? item.appearAt
      : currentTime;

    if (isHierarchy(item.type)) {
      return { ...item, x, y, appearAt };
    }

    const point: Point = {
      t: currentTime,
      x,
      y,
      ...(Number.isFinite(item.dir) ? { dir: item.dir } : {}),
      ...(item.type === "camera" && Number.isFinite(item.zoom)
        ? { zoom: item.zoom }
        : {}),
    };
    const timeline = [
      ...item.timeline.filter((p) => p.t !== currentTime),
      point,
    ].sort((a, b) => a.t - b.t);

    return {
      ...item,
      x,
      y,
      appearAt,
      zoom:
        item.type === "camera" && !Number.isFinite(item.zoom)
          ? 1
          : item.zoom,
      timeline,
    };
  };

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const type = event.dataTransfer.getData(
      "application/x-battle-palette"
    ) as SpatialType;
    const moveKey = event.dataTransfer.getData(
      "application/x-battle-item"
    );
    const p = toLogical(event.clientX, event.clientY);

    if (moveKey) {
      setItems((old) =>
        old.map((item) =>
          item.key === moveKey ? record(item, p.x, p.y) : item
        )
      );
      setSelectedKey(moveKey);
      setDraftItem(null);
      return;
    }

    if (!type) return;
    const base =
      draftItem && draftItem.type === type
        ? draftItem
        : emptyItem(type);
    const created = record(
      { ...base, key: crypto.randomUUID() },
      p.x,
      p.y
    );

    setItems((old) => [...old, created]);
    setSelectedKey(created.key);
    setDraftItem(null);
  };

  const itemDrag = (
    event: DragEvent<HTMLButtonElement>,
    key: string
  ) => {
    event.dataTransfer.setData("application/x-battle-item", key);
    event.dataTransfer.effectAllowed = "move";
    setSelectedKey(key);
    setDraftItem(null);
  };

  const updateSelected = (patch: Partial<EditorItem>) => {
    if (selectedKey) {
      setItems((old) =>
        old.map((item) => {
          if (item.key !== selectedKey) return item;

          if (
            item.type === "camera" &&
            patch.zoom !== undefined &&
            Number.isFinite(patch.zoom)
          ) {
            const current = getCreatorPositionAt(
              item.timeline,
              currentTime,
              { x: item.x, y: item.y }
            );
            const point: Point = {
              t: currentTime,
              x: current.x,
              y: current.y,
              zoom: patch.zoom,
            };
            const timeline = [
              ...item.timeline.filter((entry) => entry.t !== currentTime),
              point,
            ].sort((a, b) => a.t - b.t);

            return { ...item, ...patch, timeline };
          }

          return { ...item, ...patch };
        })
      );
    } else if (draftItem) {
      setDraftItem({ ...draftItem, ...patch });
    }
  };

  const deleteSelected = () => {
    if (!selectedKey) return;
    const deleting = items.find((item) => item.key === selectedKey);

    setItems((old) =>
      old
        .filter((item) => item.key !== selectedKey)
        .map((item) =>
          deleting?.id &&
          item.parentId === deleting.id
            ? { ...item, parentId: "" }
            : item
        )
    );
    setSelectedKey(null);
    setDraftItem(null);
  };

  const setHierarchyParent = (
    childKey: string,
    parentKey: string | null
  ) => {
    const child = items.find((item) => item.key === childKey);
    if (!child || child.type === "camera") return;

    if (parentKey === null) {
      setItems((old) =>
        old.map((item) =>
          item.key === childKey ? { ...item, parentId: "" } : item
        )
      );
      return;
    }

    const parent = items.find((item) => item.key === parentKey);
    if (
      !parent ||
      !parent.id.trim() ||
      !canCreatorParent(child.type, parent.type)
    ) {
      return;
    }

    setItems((old) =>
      old.map((item) =>
        item.key === childKey
          ? { ...item, parentId: parent.id.trim() }
          : item
      )
    );
  };

  const getParentItem = (item: EditorItem) => {
    if (!item.parentId.trim()) return null;
    const parent = items.find(
      (candidate) =>
        candidate.id.trim() === item.parentId.trim()
    );
    return parent && canCreatorParent(item.type, parent.type)
      ? parent
      : null;
  };

  const hierarchyItems = items.filter(
    (item) => item.type !== "camera"
  );

  const rootHierarchyItems = hierarchyItems.filter(
    (item) => !getParentItem(item)
  );

  const battleJson = (() => {
    const validItems = items.filter(
      (item) => !hasMissingRequiredFields(item)
    );

    const units = validItems
      .filter((item) => item.type === "unit")
      .map((item) => ({
        id: item.id.trim(),
        ...(item.force.trim()
          ? { force: item.force.trim() }
          : {}),
        ...(item.name.trim()
          ? { name: item.name.trim() }
          : {}),
        ...(item.color.trim()
          ? { color: item.color.trim() }
          : {}),
        icon: item.icon.trim() || null,
        ...(item.destroyEnabled &&
        Number.isFinite(item.destroyAt)
          ? { destroyAt: item.destroyAt }
          : {}),
      }));

    const characters = validItems
      .filter((item) => item.type === "character")
      .map((item) => ({
        id: item.id.trim(),
        ...(item.name.trim()
          ? { name: item.name.trim() }
          : {}),
        icon: item.icon.trim() || null,
        ...(item.destroyEnabled &&
        Number.isFinite(item.destroyAt)
          ? { destroyAt: item.destroyAt }
          : {}),
      }));

    const hierarchy = validItems.filter((item) =>
      isHierarchy(item.type)
    );

    const nodes = Object.fromEntries(
      hierarchy.map((item) => {
        const childrenIds =
          item.type === "regiment"
            ? []
            : hierarchy
                .filter(
                  (child) =>
                    child.parentId.trim() === item.id.trim() &&
                    canCreatorParent(child.type, item.type)
                )
                .map((child) => child.id.trim());

        const unitIds =
          item.type === "regiment"
            ? validItems
                .filter(
                  (child) =>
                    child.type === "unit" &&
                    child.parentId.trim() === item.id.trim()
                )
                .map((child) => child.id.trim())
            : [];

        const parent = getParentItem(item);

        return [
          item.id.trim(),
          {
            level: item.type,
            name: item.name.trim() || item.id.trim(),
            parentId:
              item.type === "legion"
                ? null
                : parent?.id.trim() || null,
            childrenIds,
            unitIds,
            pos: { x: item.x, y: item.y },
            ...(Number.isFinite(item.appearAt) &&
            item.appearAt > 0
              ? { appearAt: item.appearAt }
              : {}),
            ...(item.destroyEnabled &&
            Number.isFinite(item.destroyAt)
              ? { destroyAt: item.destroyAt }
              : {}),
          },
        ];
      })
    );

    const unitTimeline = Object.fromEntries(
      validItems
        .filter(
          (item) =>
            item.type === "unit" &&
            item.timeline.length > 0
        )
        .map((item) => [item.id.trim(), item.timeline])
    );

    const charTimeline = Object.fromEntries(
      validItems
        .filter(
          (item) =>
            item.type === "character" &&
            item.timeline.length > 0
        )
        .map((item) => [item.id.trim(), item.timeline])
    );

    const camera = validItems
      .filter((item) => item.type === "camera")
      .flatMap((item) =>
        item.timeline.map((point) => ({
          t: point.t,
          x: point.x,
          y: point.y,
          zoom:
            typeof point.zoom === "number" && Number.isFinite(point.zoom)
              ? point.zoom
              : item.zoom,
        }))
      )
      .sort((a, b) => a.t - b.t);

    return {
      title,
      map: {
        ...(mapImage.trim()
          ? { image: mapImage.trim() }
          : {}),
        width: mapWidth,
        height: mapHeight,
        coordinateOrigin: "center",
      },
      ...(Object.keys(nodes).length
        ? { hierarchy: { nodes } }
        : {}),
      units,
      ...(characters.length ? { characters } : {}),
      timeline: {
        ...(camera.length ? { camera } : {}),
        units: unitTimeline,
        ...(Object.keys(charTimeline).length
          ? { characters: charTimeline }
          : {}),
      },
    };
  })();

  const saveJson = () => {
    const blob = new Blob(
      [JSON.stringify(battleJson, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (title.trim() || "battle") + ".json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const requestJsonPreview = () => {
    if (hasInvalidItems) {
      setShowValidationErrors(true);
      setValidationDialog("preview");
      return;
    }
    setJsonOpen(true);
  };

  const requestJsonSave = () => {
    if (hasInvalidItems) {
      setValidationDialog("save");
      return;
    }
    saveJson();
  };

  const confirmValidationDialog = () => {
    if (validationDialog === "preview") {
      setValidationDialog(null);
      setJsonOpen(true);
      return;
    }
    if (validationDialog === "save") {
      setShowValidationErrors(true);
      setValidationDialog(null);
    }
  };

  return (
    <main className="h-screen bg-[#050816] text-gray-100 flex flex-col overflow-hidden">
      <header className="h-16 shrink-0 border-b border-gray-700 bg-[#0b1020] flex items-center gap-3 px-4">
        <Link
          href="/home"
          className="px-3 py-2 rounded bg-gray-700"
        >
          戻る
        </Link>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="戦闘名"
          className="w-52 rounded border border-gray-600 bg-[#111827] px-3 py-2"
        />
        <input
          value={mapImage}
          onChange={(e) => setMapImage(e.target.value)}
          placeholder="map.image（任意）"
          className="w-56 rounded border border-gray-600 bg-[#111827] px-3 py-2"
        />
        <input
          type="number"
          min={1}
          value={mapWidth}
          onChange={(e) =>
            setMapWidth(Math.max(1, Number(e.target.value)))
          }
          title="map.width"
          className="w-24 rounded border border-gray-600 bg-[#111827] px-2 py-2"
        />
        <input
          type="number"
          min={1}
          value={mapHeight}
          onChange={(e) =>
            setMapHeight(Math.max(1, Number(e.target.value)))
          }
          title="map.height"
          className="w-24 rounded border border-gray-600 bg-[#111827] px-2 py-2"
        />
        <span className="rounded border border-gray-700 bg-[#111827] px-3 py-2 text-xs text-gray-300">
          原点: center / 上方向 +Y
        </span>
        <button
          onClick={requestJsonPreview}
          className="ml-auto px-3 py-2 rounded bg-slate-600"
        >
          JSON確認
        </button>
        <button
          onClick={requestJsonSave}
          className="px-3 py-2 rounded bg-emerald-600"
        >
          JSON保存
        </button>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside
          className={
            "border-r border-gray-700 bg-[#0b1020] transition-all " +
            (sidebarOpen ? "w-80" : "w-12")
          }
        >
          <button
            onClick={() => setSidebarOpen((value) => !value)}
            className="w-full h-10 border-b border-gray-700"
          >
            {sidebarOpen ? "サイドパネル ◀" : "▶"}
          </button>

          {sidebarOpen && (
            <>
              <div className="grid grid-cols-2 border-b border-gray-700">
                <button
                  type="button"
                  onClick={() => setSidebarTab("elements")}
                  className={
                    "py-3 text-sm " +
                    (sidebarTab === "elements"
                      ? "bg-blue-700 text-white"
                      : "bg-[#111827] text-gray-400")
                  }
                >
                  要素パネル
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarTab("hierarchy")}
                  className={
                    "py-3 text-sm " +
                    (sidebarTab === "hierarchy"
                      ? "bg-blue-700 text-white"
                      : "bg-[#111827] text-gray-400")
                  }
                >
                  階層
                </button>
              </div>

              {sidebarTab === "elements" ? (
                <div className="p-3 grid grid-cols-2 gap-2 overflow-y-auto max-h-[calc(100vh-11rem)]">
                  {PALETTE.map((palette) => (
                    <button
                      key={palette.type}
                      draggable
                      onDragStart={(e) =>
                        paletteDrag(e, palette.type)
                      }
                      onClick={() =>
                        selectPalette(palette.type)
                      }
                      title={palette.tooltip}
                      className="min-h-20 rounded-lg border border-gray-700 bg-[#111827] hover:border-blue-400 p-2 text-left"
                    >
                      <span className="block text-2xl font-bold">
                        {palette.mark}
                      </span>
                      <span className="text-xs">
                        {palette.label}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <HierarchyPanel
                  title={title || "バトル"}
                  items={hierarchyItems}
                  roots={rootHierarchyItems}
                  selectedKey={selectedKey}
                  onSelect={(key) => {
                    setSelectedKey(key);
                    setDraftItem(null);
                  }}
                  onParent={setHierarchyParent}
                />
              )}
            </>
          )}
        </aside>

        <section className="flex-1 min-w-0 flex flex-col">
          <div
            ref={editorRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={drop}
            className="relative flex-1 m-4 overflow-hidden border border-gray-600 bg-[#0a1020]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.09) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.09) 1px, transparent 1px)",
              backgroundSize: "50px 50px",
            }}
          >
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-yellow-400/80" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-yellow-400/80" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] text-yellow-300 bg-black/60 px-1">
              (0,0)
            </div>

            {items.map((item) => {
              const visual = getCreatorElementVisualState({
                timeline: item.timeline,
                appearAt: item.appearAt,
                destroyEnabled:
                  item.type !== "camera" &&
                  item.destroyEnabled,
                destroyAt: item.destroyAt,
                t: currentTime,
                fadeDuration: 0.5,
              });

              if (!visual.visible) return null;

              const current = isHierarchy(item.type)
                ? { x: item.x, y: item.y }
                : getCreatorPositionAt(
                    item.timeline,
                    currentTime,
                    { x: item.x, y: item.y }
                  );
              const pos = toPercent(current.x, current.y);
              const mark =
                PALETTE.find(
                  (palette) => palette.type === item.type
                )?.mark ?? "?";

              const currentCameraPoint =
                item.type === "camera"
                  ? getCreatorCameraAt(
                      item.timeline,
                      currentTime,
                      {
                        x: current.x,
                        y: current.y,
                        zoom:
                          Number.isFinite(item.zoom) && item.zoom > 0
                            ? item.zoom
                            : 1,
                      }
                    )
                  : null;
              const zoom = currentCameraPoint?.zoom ?? 1;

              return (
                <div key={item.key}>
                  {item.type === "camera" && (
                    <div
                      className="pointer-events-none absolute border-2 border-red-500"
                      style={{
                        left:
                          currentCameraPoint
                            ? toPercent(
                                currentCameraPoint.x,
                                currentCameraPoint.y
                              ).left
                            : pos.left,
                        top:
                          currentCameraPoint
                            ? toPercent(
                                currentCameraPoint.x,
                                currentCameraPoint.y
                              ).top
                            : pos.top,
                        width: String(100 / zoom) + "%",
                        height: String(100 / zoom) + "%",
                        transform:
                          "translate(-50%, -50%)",
                      }}
                      title="Camera描画範囲"
                    />
                  )}
                  <button
                    draggable
                    onDragStart={(e) =>
                      itemDrag(e, item.key)
                    }
                    onClick={() => {
                      setSelectedKey(item.key);
                      setDraftItem(null);
                    }}
                    className={
                      "absolute min-w-9 h-9 rounded-full border-2 font-bold " +
                      (showValidationErrors &&
                      hasMissingRequiredFields(item)
                        ? "border-red-500 ring-2 ring-red-500/50 bg-slate-700"
                        : selectedKey === item.key
                          ? "border-yellow-300 bg-blue-600"
                          : "border-white/70 bg-slate-700")
                    }
                    style={{
                      left: pos.left,
                      top: pos.top,
                      opacity: visual.alpha,
                      transform:
                        "translate(-50%, -50%) scale(" +
                        String(visual.scale) +
                        ")",
                    }}
                    title={
                      item.type +
                      " " +
                      (item.id || "(ID未設定)") +
                      " @ " +
                      current.x.toFixed(1) +
                      "," +
                      current.y.toFixed(1)
                    }
                  >
                    {mark}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="shrink-0 border-t border-gray-700 bg-[#111827] px-5 py-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (currentTime >= duration) {
                    setCurrentTime(0);
                  }
                  setIsPlaying(true);
                }}
                className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700"
              >
                再生
              </button>
              <button
                type="button"
                onClick={() => setIsPlaying(false)}
                className="px-3 py-1 rounded bg-gray-600 hover:bg-gray-500"
              >
                ストップ
              </button>
              <span className="w-20 text-sm">
                {currentTime.toFixed(1)}s
              </span>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.1}
                value={currentTime}
                onChange={(e) => {
                  setIsPlaying(false);
                  setCurrentTime(Number(e.target.value));
                }}
                className="flex-1"
              />
              <label className="text-xs flex items-center gap-2">
                最大秒数
                <input
                  type="number"
                  min={1}
                  value={duration}
                  onChange={(e) =>
                    setDuration(
                      Math.max(1, Number(e.target.value))
                    )
                  }
                  className="w-20 rounded border border-gray-600 bg-[#0b1020] px-2 py-1"
                />
              </label>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              配置時刻が出現時刻です。破壊フラグの指定時刻から0.5秒かけてフェードアウトします。
            </p>
          </div>
        </section>

        <aside className="w-80 shrink-0 border-l border-gray-700 bg-[#0b1020] overflow-y-auto">
          {selected ? (
            <ItemProperties
              item={selected}
              placed={Boolean(selectedKey)}
              currentTime={currentTime}
              items={items}
              onChange={updateSelected}
              onDelete={deleteSelected}
            />
          ) : null}
        </aside>
      </div>

      {validationDialog && (
        <div className="fixed inset-0 z-[60] bg-black/70 p-8 flex items-center justify-center">
          <div className="w-full max-w-xl rounded-xl border border-red-800 bg-[#111827] p-6 shadow-2xl">
            <h2 className="text-lg font-semibold mb-4">
              入力必須項目の確認
            </h2>
            <p className="text-sm leading-7 text-gray-200">
              {validationDialog === "preview"
                ? "現在画面上に配置された要素の内、赤いアウトラインが表示されている要素に入力必須のプロパティが空です。空の場合JSON確認の際、当該要素はJSONに表示されません。"
                : "画面上に配置されている要素のプロパティに入力必須な入力欄が空の要素があります。要素を削除するか、入力必須欄に記入してください"}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={confirmValidationDialog}
                className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700"
              >
                OK
              </button>
              {validationDialog === "preview" && (
                <button
                  type="button"
                  onClick={() =>
                    setValidationDialog(null)
                  }
                  className="px-4 py-2 rounded bg-gray-600 hover:bg-gray-500"
                >
                  NO
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {jsonOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 p-8 flex items-center justify-center">
          <div className="w-full max-w-4xl max-h-full flex flex-col rounded-xl border border-gray-700 bg-[#0b1020]">
            <div className="flex items-center border-b border-gray-700 p-3">
              <strong>生成JSON</strong>
              <button
                className="ml-auto px-3 py-1 rounded bg-gray-700"
                onClick={() => setJsonOpen(false)}
              >
                閉じる
              </button>
            </div>
            <pre className="overflow-auto p-4 text-xs">
              {JSON.stringify(battleJson, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </main>
  );
}

function HierarchyPanel({
  title,
  items,
  roots,
  selectedKey,
  onSelect,
  onParent,
}: {
  title: string;
  items: EditorItem[];
  roots: EditorItem[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onParent: (
    childKey: string,
    parentKey: string | null
  ) => void;
}) {
  const childrenOf = (parent: EditorItem) =>
    items.filter(
      (item) =>
        item.parentId.trim() === parent.id.trim() &&
        canCreatorParent(item.type, parent.type)
    );

  return (
    <div className="p-3 overflow-y-auto max-h-[calc(100vh-11rem)]">
      <div
        className="rounded-lg border border-blue-700 bg-blue-950/40 p-3"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const key = e.dataTransfer.getData(
            "application/x-battle-hierarchy"
          );
          if (key) onParent(key, null);
        }}
      >
        <div className="font-semibold text-sm">
          {title}
        </div>
        <div className="mt-2 space-y-1">
          {roots.map((item) => (
            <HierarchyNodeRow
              key={item.key}
              item={item}
              depth={0}
              selectedKey={selectedKey}
              childrenOf={childrenOf}
              onSelect={onSelect}
              onParent={onParent}
            />
          ))}
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-5 text-gray-500">
        D&amp;Dで Legion → Corps → Division → Regiment → Unit
        の順に親子関係を設定できます。Characterは戦闘名直下固定です。
        戦闘名へドロップすると親子関係を解除します。
      </p>
    </div>
  );
}

function HierarchyNodeRow({
  item,
  depth,
  selectedKey,
  childrenOf,
  onSelect,
  onParent,
}: {
  item: EditorItem;
  depth: number;
  selectedKey: string | null;
  childrenOf: (item: EditorItem) => EditorItem[];
  onSelect: (key: string) => void;
  onParent: (
    childKey: string,
    parentKey: string | null
  ) => void;
}) {
  const children = childrenOf(item);
  const parentable =
    ["legion", "corps", "division", "regiment"].includes(
      item.type
    );

  return (
    <div>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(
            "application/x-battle-hierarchy",
            item.key
          );
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          if (parentable) e.preventDefault();
        }}
        onDrop={(e) => {
          if (!parentable) return;
          e.preventDefault();
          e.stopPropagation();
          const childKey = e.dataTransfer.getData(
            "application/x-battle-hierarchy"
          );
          if (childKey && childKey !== item.key) {
            onParent(childKey, item.key);
          }
        }}
        onClick={() => onSelect(item.key)}
        className={
          "rounded px-2 py-1 text-xs cursor-pointer border " +
          (selectedKey === item.key
            ? "border-yellow-400 bg-yellow-950/30"
            : "border-transparent hover:border-gray-600 hover:bg-[#111827]")
        }
        style={{ marginLeft: depth * 14 }}
        title={
          item.id
            ? item.type + ": " + item.id
            : item.type + ": ID未設定"
        }
      >
        <span className="mr-2 text-gray-500">
          {item.type}
        </span>
        <span>{item.name || item.id || "(ID未設定)"}</span>
        {item.destroyEnabled && (
          <span className="ml-2 text-red-400">
            [破壊]
          </span>
        )}
      </div>

      {children.map((child) => (
        <HierarchyNodeRow
          key={child.key}
          item={child}
          depth={depth + 1}
          selectedKey={selectedKey}
          childrenOf={childrenOf}
          onSelect={onSelect}
          onParent={onParent}
        />
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  invalid = false,
  help,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  invalid?: boolean;
  help?: string;
}) {
  return (
    <label className="block mb-3">
      <span className="block text-xs text-gray-400 mb-1">
        {label}
        {required && (
          <span className="ml-1 text-red-400">*</span>
        )}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={
          "w-full rounded border bg-[#111827] px-3 py-2 text-sm " +
          (invalid
            ? "border-red-500"
            : "border-gray-600")
        }
      />
      {required && invalid && (
        <span className="block mt-1 text-xs text-red-400">
          必須入力フォームです
        </span>
      )}
      {help && (
        <span className="block mt-1 text-[11px] text-gray-500">
          {help}
        </span>
      )}
    </label>
  );
}

function ItemProperties({
  item,
  placed,
  currentTime,
  items,
  onChange,
  onDelete,
}: {
  item: EditorItem;
  placed: boolean;
  currentTime: number;
  items: EditorItem[];
  onChange: (patch: Partial<EditorItem>) => void;
  onDelete: () => void;
}) {
  const expected = expectedCreatorParentType(item.type);
  const parent =
    item.parentId.trim() === ""
      ? null
      : items.find(
          (candidate) =>
            candidate.id.trim() ===
            item.parentId.trim()
        ) ?? null;
  const parentInvalid =
    canCreatorHaveManualParent(item.type) &&
    Boolean(item.parentId.trim()) &&
    (!parent ||
      !expected ||
      parent.type !== expected);

  return (
    <div className="p-4">
      <h2 className="font-semibold mb-1">
        プロパティ
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        {item.type} / {placed ? "配置済み" : "未配置"}
      </p>

      {item.type !== "camera" && (
        <>
          <Field
            label="id"
            value={item.id}
            onChange={(id) => onChange({ id })}
            required
            invalid={!item.id.trim()}
          />
          <Field
            label="name"
            value={item.name}
            onChange={(name) => onChange({ name })}
          />
        </>
      )}

      {item.type === "unit" && (
        <>
          <Field
            label="force"
            value={item.force}
            onChange={(force) => onChange({ force })}
          />
          <Field
            label="color"
            value={item.color}
            onChange={(color) => onChange({ color })}
          />
          <Field
            label="icon"
            value={item.icon}
            onChange={(icon) => onChange({ icon })}
          />
        </>
      )}

      {item.type === "character" && (
        <Field
          label="icon"
          value={item.icon}
          onChange={(icon) => onChange({ icon })}
        />
      )}

      {(item.type === "unit" ||
        item.type === "character") && (
        <Field
          label="dir（rad・任意）"
          type="number"
          value={
            Number.isFinite(item.dir) ? item.dir : ""
          }
          onChange={(dir) =>
            onChange({
              dir:
                dir === ""
                  ? Number.NaN
                  : Number(dir),
            })
          }
        />
      )}

      {canCreatorHaveManualParent(item.type) && (
        <Field
          label="parentId"
          value={item.parentId}
          onChange={(parentId) =>
            onChange({ parentId })
          }
          invalid={parentInvalid}
          help={
            parentInvalid
              ? "指定できる親は " +
                String(expected) +
                " のIDです。"
              : "階層タブのD&Dと双方向で同期します。"
          }
        />
      )}

      {isCreatorBattleRootOnly(item.type) && (
        <div className="mb-3 rounded border border-gray-700 bg-[#111827] p-3 text-xs text-gray-400">
          親: バトル（固定）
        </div>
      )}

      <Field
        label="x"
        type="number"
        value={Number.isFinite(item.x) ? item.x : ""}
        onChange={(x) =>
          onChange({
            x:
              x === ""
                ? Number.NaN
                : Number(x),
          })
        }
      />
      <Field
        label="y"
        type="number"
        value={Number.isFinite(item.y) ? item.y : ""}
        onChange={(y) =>
          onChange({
            y:
              y === ""
                ? Number.NaN
                : Number(y),
          })
        }
      />

      {item.type === "camera" && (
        <Field
          label="zoom"
          type="number"
          value={
            Number.isFinite(item.zoom) ? item.zoom : ""
          }
          onChange={(zoom) =>
            onChange({
              zoom:
                zoom === ""
                  ? Number.NaN
                  : Number(zoom),
            })
          }
          required
          invalid={
            !Number.isFinite(item.zoom) ||
            item.zoom <= 0
          }
          help="赤い四角の描画範囲がzoomに応じて収縮・拡大します。"
        />
      )}

      {item.type !== "camera" && (
        <div className="mb-3 rounded border border-gray-700 bg-[#111827] p-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={item.destroyEnabled}
              onChange={(e) =>
                onChange({
                  destroyEnabled: e.target.checked,
                  destroyAt: e.target.checked
                    ? Number.isFinite(item.destroyAt)
                      ? item.destroyAt
                      : Math.max(
                          currentTime,
                          Number.isFinite(item.appearAt)
                            ? item.appearAt
                            : currentTime
                        )
                    : Number.NaN,
                })
              }
            />
            破壊フラグ
          </label>

          <p className="mt-2 text-[11px] leading-5 text-gray-500">
            指定秒数から0.5秒かけてフェードアウトし、その後は表示されません。
          </p>

          {item.destroyEnabled && (
            <div className="mt-3">
              <Field
                label="破壊秒数"
                type="number"
                value={
                  Number.isFinite(item.destroyAt)
                    ? item.destroyAt
                    : ""
                }
                onChange={(destroyAt) =>
                  onChange({
                    destroyAt:
                      destroyAt === ""
                        ? Number.NaN
                        : Number(destroyAt),
                  })
                }
                required
                invalid={
                  !Number.isFinite(item.destroyAt) ||
                  item.destroyAt < item.appearAt
                }
              />
            </div>
          )}
        </div>
      )}

      <div className="rounded border border-gray-700 bg-[#111827] p-3 text-xs">
        現在時刻: {currentTime.toFixed(1)}s
        <br />
        出現時刻:{" "}
        {Number.isFinite(item.appearAt)
          ? item.appearAt.toFixed(1)
          : "-"}
        s
        <br />
        記録済みkeyframe: {item.timeline.length}
      </div>

      {placed && (
        <button
          type="button"
          onClick={onDelete}
          className="mt-4 w-full rounded bg-red-700 py-2 hover:bg-red-800"
        >
          要素を削除
        </button>
      )}
    </div>
  );
}
