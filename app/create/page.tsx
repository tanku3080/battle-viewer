"use client";

import Link from "next/link";
import { DragEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import ForcePicker from "@/components/battle/ForcePicker";
import ImageAssetPicker from "@/components/battle/ImageAssetPicker";
import { createBattleHubForce, getBattleHubForces } from "@/utils/battleHub/client";
import { getForceColor, type ForceDefinition } from "@/utils/battle/forces";
import {
  buildCreatorWorldTimeline,
  getCreatorItemPositionAt,
  getCreatorGroupMoveAt,
  initializeCreatorGroupOrigin,
  recordCreatorPosition,
  setCreatorGroupMove,
  stepCreatorCoordinate,
  syncCreatorGroupOrigins,
  type CreatorMovementPoint,
  type CreatorGroupMovePoint,
} from "@/utils/battleCreator/movement";
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
  isCreatorParentOf,
} from "@/utils/battleCreator/hierarchy";
import {
  getCreatorDefaultName,
  getCreatorDisplayName,
} from "@/utils/battleCreator/items";

type SpatialType =
  | "unit"
  | "character"
  | "legion"
  | "corps"
  | "division"
  | "regiment"
  | "camera";
type SidebarTab = "elements" | "hierarchy";
type Point = CreatorMovementPoint;
type EditorItem = {
  key: string;
  type: SpatialType;
  id: string;
  name: string;
  force: string;
  color: string;
  icon: string;
  parentId: string;
  groupMove: boolean;
  groupMoveTimeline?: CreatorGroupMovePoint[];
  groupOrigin?: { key: string; x: number; y: number };
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
    groupMove: false,
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

function getParentItem(items: EditorItem[], item: EditorItem) {
  return items.find((candidate) => isCreatorParentOf(candidate, item)) ?? null;
}

function getCreatorOutlineColor(
  items: EditorItem[],
  item: EditorItem,
  forces: ForceDefinition[]
) {
  if (item.type === "unit") {
    return getForceColor(forces, item.force) || item.color.trim() || "#cbd5f5";
  }

  if (item.color.trim()) return item.color.trim();

  const visited = new Set<string>();
  const findDescendantUnitColor = (parent: EditorItem): string | null => {
    if (visited.has(parent.key)) return null;
    visited.add(parent.key);

    const children = items.filter((candidate) => isCreatorParentOf(parent, candidate));
    for (const child of children) {
      if (child.type === "unit") {
        return getForceColor(forces, child.force) || child.color.trim() || null;
      }
      const nested = findDescendantUnitColor(child);
      if (nested) return nested;
    }
    return null;
  };

  if (isHierarchy(item.type)) {
    return findDescendantUnitColor(item) || "#cbd5f5";
  }

  if (item.type === "character") return "#f97316";
  return "#cbd5f5";
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
  const [forces, setForces] = useState<ForceDefinition[]>([]);
  const [forcesLoading, setForcesLoading] = useState(true);
  const [forcesError, setForcesError] = useState("");
  const [forceLoadVersion, setForceLoadVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getBattleHubForces(controller.signal).then((registered) => {
      setForces(registered); setForcesError("");
    }).catch((error) => {
      if (!controller.signal.aborted) setForcesError(error instanceof Error ? error.message : "force一覧を取得できません");
    }).finally(() => {
      if (!controller.signal.aborted) setForcesLoading(false);
    });
    return () => controller.abort();
  }, [forceLoadVersion]);

  const retryForces = () => { setForcesLoading(true); setForceLoadVersion((version) => version + 1); };
  const createForce = async (force: ForceDefinition) => {
    const registered = await createBattleHubForce(force);
    setForces((old) => [...old.filter((entry) => entry.name !== registered.name), registered]);
    return registered;
  };

  const invalidItems = useMemo(
    () => items.filter((item) => hasMissingRequiredFields(item)),
    [items]
  );
  const hasInvalidItems = invalidItems.length > 0;

  const selectedSource =
    items.find((item) => item.key === selectedKey) ?? draftItem ?? null;

  const selected =
    selectedSource && selectedKey
      ? {
          ...selectedSource,
          ...getCreatorItemPositionAt(items, selectedSource, currentTime),
          groupMove: getCreatorGroupMoveAt(selectedSource, currentTime),
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

  const record = (item: EditorItem, x: number, y: number, explicit = true) => {
    const updated = recordCreatorPosition(item, x, y, currentTime, {
      ...(Number.isFinite(item.dir) ? { dir: item.dir } : {}),
      ...(item.type === "camera" && Number.isFinite(item.zoom)
        ? { zoom: item.zoom }
        : {}),
    }, explicit);
    return {
      ...updated,
      zoom:
        item.type === "camera" && !Number.isFinite(item.zoom)
          ? 1
          : item.zoom,
    };
  };

  const placeDraftAt = (p: { x: number; y: number }) => {
    if (!draftItem) return;
    const type = draftItem.type;
    const created = record(
      {
        ...draftItem,
        key: crypto.randomUUID(),
        name:
          draftItem.name.trim() ||
          getCreatorDefaultName(type, items),
      },
      p.x,
      p.y,
      false
    );

    setItems((old) => [...old, initializeCreatorGroupOrigin(old, created)]);
    setSelectedKey(created.key);
    setDraftItem(null);
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
      {
        ...base,
        key: crypto.randomUUID(),
        name:
          base.name.trim() ||
          getCreatorDefaultName(type, items),
      },
      p.x,
      p.y,
      false
    );

    setItems((old) => [...old, initializeCreatorGroupOrigin(old, created)]);
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
      setItems((old) => {
        if (patch.groupMove !== undefined) {
          return setCreatorGroupMove(old, selectedKey, patch.groupMove, currentTime);
        }
        const next = old.map((item) => {
          if (item.key !== selectedKey) return item;
          const updated = { ...item, ...patch };
          if ((patch.x !== undefined && Number.isFinite(patch.x)) ||
              (patch.y !== undefined && Number.isFinite(patch.y))) {
            const current = getCreatorItemPositionAt(old, item, currentTime);
            return record(updated, patch.x ?? current.x, patch.y ?? current.y);
          }

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

          return updated;
        });
        return syncCreatorGroupOrigins(old, next, currentTime);
      });
    } else if (draftItem) {
      setDraftItem({ ...draftItem, ...patch });
    }
  };

  const deleteSelected = () => {
    if (!selectedKey) return;
    const deleting = items.find((item) => item.key === selectedKey);
    const deletingId = deleting?.id.trim() ?? "";

    setItems((old) => syncCreatorGroupOrigins(old,
      old
        .filter((item) => item.key !== selectedKey)
        .map((item) =>
          deletingId &&
          item.parentId.trim() === deletingId
            ? { ...item, parentId: "" }
            : item
        ), currentTime));
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
      setItems((old) => syncCreatorGroupOrigins(old,
        old.map((item) =>
          item.key === childKey ? { ...item, parentId: "" } : item
        ), currentTime));
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

    setItems((old) => syncCreatorGroupOrigins(old,
      old.map((item) =>
        item.key === childKey
          ? { ...item, parentId: parent.id.trim() }
          : item
      ), currentTime));
  };

  const hierarchyItems = items.filter(
    (item) => item.type !== "camera"
  );

  const rootHierarchyItems = hierarchyItems.filter(
    (item) => !getParentItem(items, item)
  );

  const battleJson = useMemo(() => {
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
        ...(getForceColor(forces, item.force) || item.color.trim()
          ? { color: getForceColor(forces, item.force) || item.color.trim() }
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
                  (child) => isCreatorParentOf(item, child)
                )
                .map((child) => child.id.trim());

        const unitIds =
          item.type === "regiment"
            ? validItems
                .filter(
                  (child) =>
                    child.type === "unit" &&
                    isCreatorParentOf(item, child)
                )
                .map((child) => child.id.trim())
            : [];

        const parent = getParentItem(items, item);

        return [
          item.id.trim(),
          {
            level: item.type,
            name: item.name.trim() || item.id.trim(),
            ...(item.icon.trim() ? { icon: item.icon.trim() } : {}),
            parentId:
              item.type === "legion"
                ? null
                : parent?.id.trim() || null,
            childrenIds,
            unitIds,
            pos: getCreatorItemPositionAt(items, item, item.appearAt),
            groupMove: getCreatorGroupMoveAt(item, item.appearAt),
            ...(item.groupMoveTimeline?.length ? { groupMoveTimeline: item.groupMoveTimeline } : {}),
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
        .map((item) => [item.id.trim(), buildCreatorWorldTimeline(items, item)])
    );

    const charTimeline = Object.fromEntries(
      validItems
        .filter(
          (item) =>
            item.type === "character" &&
            item.timeline.length > 0
        )
        .map((item) => [item.id.trim(), buildCreatorWorldTimeline(items, item)])
    );

    const hierarchyTimeline = Object.fromEntries(
      hierarchy.map((item) => [item.id.trim(), buildCreatorWorldTimeline(items, item)])
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
      ...(forces.length ? { forces: forces.map(({ name, color }) => ({ name, color })) } : {}),
      ...(characters.length ? { characters } : {}),
      timeline: {
        ...(camera.length ? { camera } : {}),
        units: unitTimeline,
        ...(hierarchy.length ? { hierarchy: hierarchyTimeline } : {}),
        ...(Object.keys(charTimeline).length
          ? { characters: charTimeline }
          : {}),
      },
    };
  }, [items, forces, title, mapImage, mapWidth, mapHeight]);

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
          aria-label="戦闘名"
          className="w-52 rounded border border-gray-600 bg-[#111827] px-3 py-2"
        />
        <ImageAssetPicker
          label="Map画像"
          value={mapImage}
          aspectRatio={mapWidth / mapHeight}
          mode="map"
          onChange={setMapImage}
          compact
        />
        <input
          type="number"
          min={1}
          value={mapWidth}
          onChange={(e) =>
            setMapWidth(Math.max(1, Number(e.target.value)))
          }
          title="map.width"
          aria-label="マップ幅"
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
          aria-label="マップ高さ"
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
            "h-full min-h-0 shrink-0 border-r border-gray-700 bg-[#0b1020] transition-all flex flex-col overflow-hidden " +
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
            <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
              <div className="shrink-0 grid grid-cols-2 border-b border-gray-700" role="tablist" aria-label="Creatorサイドパネル">
                <button
                  type="button"
                  role="tab"
                  aria-selected={sidebarTab === "elements"}
                  aria-controls="creator-elements-panel"
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
                  role="tab"
                  aria-selected={sidebarTab === "hierarchy"}
                  aria-controls="creator-hierarchy-panel"
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
                <div id="creator-elements-panel" role="tabpanel" className="flex-1 min-h-0 min-w-0 overflow-auto p-3">
                  <div className="grid w-full grid-cols-2 gap-2">
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
            </div>
          )}
        </aside>

        <section className="flex-1 min-w-0 flex flex-col">
          <div
            ref={editorRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={drop}
            onClick={(event) => {
              if (!draftItem) return;
              if ((event.target as HTMLElement).closest("button, input, select, textarea")) return;
              placeDraftAt(toLogical(event.clientX, event.clientY));
            }}
            role="region"
            aria-label="戦場編集エリア。要素パネルで要素を選択した後、この領域をクリックして配置できます。"
            className="relative flex-1 m-4 overflow-hidden border border-gray-600 bg-[#0a1020]"
            style={{
              backgroundImage: mapImage
                ? `linear-gradient(rgba(255,255,255,.09) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.09) 1px, transparent 1px), url("${mapImage}")`
                : "linear-gradient(rgba(255,255,255,.09) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.09) 1px, transparent 1px)",
              backgroundSize: mapImage
                ? "50px 50px, 50px 50px, 100% 100%"
                : "50px 50px",
              backgroundRepeat: mapImage ? "repeat, repeat, no-repeat" : "repeat",
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
                animateTransitions: isPlaying,
              });

              if (!visual.visible) return null;

              const current = getCreatorItemPositionAt(items, item, currentTime);
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
              const iconOutlineColor = getCreatorOutlineColor(items, item, forces);

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
                    onClick={(event) => {
                      event.stopPropagation();
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
                      ...(item.type === "unit" && getForceColor(forces, item.force)
                        ? { backgroundColor: getForceColor(forces, item.force) }
                        : {}),
                      opacity: visual.alpha,
                      transform:
                        "translate(-50%, -50%) scale(" +
                        String(visual.scale) +
                        ")",
                    }}
                    title={
                      getCreatorDisplayName(item) +
                      (item.type === "camera"
                        ? ""
                        : item.id.trim()
                          ? " / ID: " + item.id.trim()
                          : " / ID未設定") +
                      " @ " +
                      current.x.toFixed(1) +
                      "," +
                      current.y.toFixed(1)
                    }
                  >
                    {item.icon ? (
                      <span
                        className="flex h-8 w-8 overflow-hidden rounded-full border-[3px] bg-black"
                        style={{ borderColor: iconOutlineColor }}
                      >
                        <img
                          src={item.icon}
                          alt=""
                          className="h-full w-full rounded-full object-cover"
                        />
                      </span>
                    ) : (
                      mark
                    )}
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
              配置時刻が出現時刻です。要素パネルで種類を選択後、戦場をクリックしても配置できます。破壊フラグの指定時刻から0.5秒かけてフェードアウトします。
            </p>
          </div>
        </section>

        <aside className="w-80 shrink-0 border-l border-gray-700 bg-[#0b1020] overflow-y-auto">
          {selected ? (
            <ItemProperties
              key={selected.key}
              item={selected}
              placed={Boolean(selectedKey)}
              forces={forces}
              forcesLoading={forcesLoading}
              forcesError={forcesError}
              onRetryForces={retryForces}
              onCreateForce={createForce}
              currentTime={currentTime}
              items={items}
              onChange={updateSelected}
              onDelete={deleteSelected}
            />
          ) : null}
        </aside>
      </div>

      {validationDialog && (
        <div className="fixed inset-0 z-[60] bg-black/70 p-8 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="creator-validation-title">
          <div className="w-full max-w-xl rounded-xl border border-red-800 bg-[#111827] p-6 shadow-2xl">
            <h2 id="creator-validation-title" className="text-lg font-semibold mb-4">
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
        <div className="fixed inset-0 z-50 bg-black/70 p-8 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="creator-json-title">
          <div className="w-full max-w-4xl max-h-full flex flex-col rounded-xl border border-gray-700 bg-[#0b1020]">
            <div className="flex items-center border-b border-gray-700 p-3">
              <strong id="creator-json-title">生成JSON</strong>
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
    items.filter((item) => isCreatorParentOf(parent, item));

  return (
    <div id="creator-hierarchy-panel" role="tabpanel" className="flex-1 min-h-0 min-w-0 overflow-auto p-3">
      <div className="inline-block min-w-full align-top">
        <div
          className="min-w-full rounded-lg border border-blue-700 bg-blue-950/40 p-3"
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
          "w-max min-w-full whitespace-nowrap rounded px-2 py-1 text-xs cursor-pointer border " +
          (selectedKey === item.key
            ? "border-yellow-400 bg-yellow-950/30"
            : "border-transparent hover:border-gray-600 hover:bg-[#111827]")
        }
        style={{ marginLeft: depth * 14 }}
        title={
          getCreatorDisplayName(item) +
          " [" +
          item.type +
          "] / " +
          (item.id.trim()
            ? "ID: " + item.id.trim()
            : "ID未設定")
        }
      >
        <span className="font-medium text-gray-100">
          {getCreatorDisplayName(item)}
        </span>
        <span className="ml-2 text-gray-500">
          [{item.type}]
        </span>
        <span className="ml-2 text-gray-500">
          {item.id.trim()
            ? "ID: " + item.id.trim()
            : "ID未設定"}
        </span>
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
  coordinate = false,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  invalid?: boolean;
  help?: string;
  coordinate?: boolean;
}) {
  const inputId = useId();
  const helpId = useId();
  const describedBy = invalid || help ? helpId : undefined;
  const step = (delta: number) => {
    const numeric = Number(value);
    onChange(String((Number.isFinite(numeric) ? numeric : 0) + delta));
  };

  return (
    <label className="block mb-3" htmlFor={inputId}>
      <span className="block text-xs text-gray-300 mb-1">
        {label}
        {required && (
          <span className="ml-1 text-red-300" aria-hidden="true">*</span>
        )}
      </label>
      <div className={coordinate ? "flex items-center gap-2" : undefined}>
        {coordinate && (
          <button
            type="button"
            onClick={() => step(-1)}
            className="min-h-9 min-w-9 rounded border border-gray-600 bg-gray-700 px-2 hover:bg-gray-600"
            aria-label={label + "を1減らす"}
          >
            −
          </button>
        )}
        <input
          id={inputId}
          type={type}
          value={value}
          aria-required={required || undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(event) => {
            if (!coordinate) return;
            const next = stepCreatorCoordinate(
              event.currentTarget.value,
              event.key
            );
            if (next === null) return;
            event.preventDefault();
            onChange(String(next));
          }}
          className={
            "w-full rounded border bg-[#111827] px-3 py-2 text-sm " +
            (invalid ? "border-red-500" : "border-gray-600")
          }
        />
        {coordinate && (
          <button
            type="button"
            onClick={() => step(1)}
            className="min-h-9 min-w-9 rounded border border-gray-600 bg-gray-700 px-2 hover:bg-gray-600"
            aria-label={label + "を1増やす"}
          >
            ＋
          </button>
        )}
      </div>
      {(required && invalid) || help ? (
        <span
          id={helpId}
          role={required && invalid ? "alert" : undefined}
          className={
            "block mt-1 text-xs " +
            (required && invalid ? "text-red-300" : "text-gray-300")
          }
        >
          {required && invalid ? "必須入力フォームです" : help}
        </span>
      ) : null}
    </div>
  );
}

function ItemProperties({
  item,
  placed,
  currentTime,
  items,
  onChange,
  onDelete,
  forces,
  forcesLoading,
  forcesError,
  onRetryForces,
  onCreateForce,
}: {
  item: EditorItem;
  placed: boolean;
  currentTime: number;
  items: EditorItem[];
  onChange: (patch: Partial<EditorItem>) => void;
  onDelete: () => void;
  forces: ForceDefinition[];
  forcesLoading: boolean;
  forcesError: string;
  onRetryForces: () => void;
  onCreateForce: (force: ForceDefinition) => Promise<ForceDefinition>;
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
  const parentOptions = expected
    ? items.filter(
        (candidate) =>
          candidate.key !== item.key &&
          candidate.type === expected &&
          Boolean(candidate.id.trim())
      )
    : [];
  const selectedParentValue = parentOptions.some(
    (candidate) => candidate.id.trim() === item.parentId.trim()
  )
    ? item.parentId.trim()
    : item.parentId.trim()
      ? "__manual__"
      : "";

  return (
    <div className="p-4">
      <h2 className="font-semibold mb-1">
        プロパティ
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        {item.type} / {placed ? "配置済み" : "未配置"}
      </p>

      {item.type !== "camera" && (
        <Field
          label="id"
          value={item.id}
          onChange={(id) => onChange({ id })}
          required
          invalid={!item.id.trim()}
        />
      )}

      <Field
        label={item.type === "camera" ? "name（表示用）" : "name"}
        value={item.name}
        onChange={(name) => onChange({ name })}
      />

      {item.type === "unit" && (
        <ForcePicker
          value={item.force}
          onChange={(force) => onChange({ force })}
          forces={forces}
          loading={forcesLoading}
          loadError={forcesError}
          onRetry={onRetryForces}
          onCreate={onCreateForce}
        />
      )}

      {item.type !== "camera" && (
        <ImageAssetPicker
          label="icon"
          value={item.icon}
          aspectRatio={1}
          mode="icon"
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
        <>
          <label className="block mb-3 text-xs text-gray-300">
            親を選択
            <select
              value={selectedParentValue}
              onChange={(event) => {
                if (event.target.value !== "__manual__") {
                  onChange({ parentId: event.target.value });
                }
              }}
              className="mt-1 w-full rounded border border-gray-600 bg-[#111827] px-3 py-2 text-sm"
            >
              <option value="">親なし</option>
              {parentOptions.map((candidate) => (
                <option key={candidate.key} value={candidate.id.trim()}>
                  {getCreatorDisplayName(candidate)} ({candidate.id.trim()})
                </option>
              ))}
              {selectedParentValue === "__manual__" && (
                <option value="__manual__" disabled>
                  現在の入力: {item.parentId}
                </option>
              )}
            </select>
          </label>
          <Field
            label="parentId"
            value={item.parentId}
            onChange={(parentId) => onChange({ parentId })}
            invalid={parentInvalid}
            help={
              parentInvalid
                ? "指定できる親は " + String(expected) + " のIDです。"
                : "親選択、階層タブのD&D、手入力は双方向で同期します。"
            }
          />
        </>
      )}

      {isCreatorBattleRootOnly(item.type) && (
        <div className="mb-3 rounded border border-gray-700 bg-[#111827] p-3 text-xs text-gray-400">
          親: バトル（固定）
        </div>
      )}

      {isHierarchy(item.type) && (
        <div className="mb-3 rounded border border-gray-700 bg-[#111827] p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={item.groupMove} onChange={(event) => onChange({ groupMove: event.target.checked })} />
            グループ移動
          </label>
          <p className="mt-2 text-[11px] leading-5 text-gray-500">
            オン・オフは現在時刻に記録され、切り替え前の移動経路は保持されます。
            最上位の有効な親の移動に配下が追従します。個別に記録した位置・経路が優先され、最後の個別指定以降は親の移動分に追従します。
          </p>
        </div>
      )}

      <Field
        label="x"
        type="number"
        coordinate
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
        coordinate
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
