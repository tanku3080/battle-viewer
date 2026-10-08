"use client";
import { consumeDistributedJson } from "@/utils/battleHub/pendingTransfer";

import Link from "next/link";
import { ChangeEvent, DragEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import ForcePicker from "@/components/battle/ForcePicker";
import ImageAssetPicker from "@/components/battle/ImageAssetPicker";
import { useI18n, type MessageKey } from "@/i18n/I18nProvider";
import { createBattleHubForce, getBattleHubForces } from "@/utils/battleHub/client";
import { getForceColor, type ForceDefinition } from "@/utils/battle/forces";
import type { RawBattleJson } from "@/utils/battle/loadBattleJson";
import {
  importCreatorBattleJson,
  planCreatorForceSync,
} from "@/utils/battleCreator/importBattle";
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
  description: string;
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
  tooltipKey: MessageKey;
}> = [
  {
    type: "unit",
    label: "Unit",
    mark: "●",
    tooltipKey: "creator.palette.unit",
  },
  {
    type: "character",
    label: "Character",
    mark: "◆",
    tooltipKey: "creator.palette.character",
  },
  {
    type: "legion",
    label: "Legion",
    mark: "L",
    tooltipKey: "creator.palette.legion",
  },
  {
    type: "corps",
    label: "Corps",
    mark: "C",
    tooltipKey: "creator.palette.corps",
  },
  {
    type: "division",
    label: "Division",
    mark: "D",
    tooltipKey: "creator.palette.division",
  },
  {
    type: "regiment",
    label: "Regiment",
    mark: "R",
    tooltipKey: "creator.palette.regiment",
  },
  {
    type: "camera",
    label: "Camera",
    mark: "◎",
    tooltipKey: "creator.palette.camera",
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
    description: "",
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
  const { t } = useI18n();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("elements");
  const [title, setTitle] = useState("Battle");
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
  const [isImporting, setIsImporting] = useState(false);
  const [importNotice, setImportNotice] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getBattleHubForces(controller.signal).then((registered) => {
      setForces(registered); setForcesError("");
    }).catch((error) => {
      if (!controller.signal.aborted) setForcesError(error instanceof Error ? error.message : t("force.loadFailed"));
    }).finally(() => {
      if (!controller.signal.aborted) setForcesLoading(false);
    });
    return () => controller.abort();
  }, [forceLoadVersion, t]);

  const retryForces = () => { setForcesLoading(true); setForceLoadVersion((version) => version + 1); };
  const createForce = async (force: ForceDefinition) => {
    const registered = await createBattleHubForce(force);
    setForces((old) => [...old.filter((entry) => entry.name !== registered.name), registered]);
    return registered;
  };

  const importBattleText = async (source: string) => {
    if (isImporting) return;
    setIsImporting(true);
    setImportNotice(null);

    try {
      const parsed = JSON.parse(source) as RawBattleJson;
      const imported = importCreatorBattleJson(parsed);

      // Validate the full sync plan before changing Creator state.
      const registered = await getBattleHubForces();
      const plan = planCreatorForceSync(imported, registered);
      if (plan.unresolvedForces.length) {
        throw new Error(
          t("creator.importForceMissingColor", {
            names: plan.unresolvedForces.join(", "),
          })
        );
      }

      const synced = [...registered];
      for (const definition of plan.missingDefinitions) {
        const created = await createBattleHubForce(definition);
        const key = created.name.trim().toLowerCase();
        const existingIndex = synced.findIndex(
          (force) => force.name.trim().toLowerCase() === key
        );
        if (existingIndex >= 0) synced[existingIndex] = created;
        else synced.push(created);
      }

      const canonicalForceNames = new Map(
        synced.map((force) => [
          force.name.trim().toLowerCase(),
          force.name,
        ])
      );
      const importedItems: EditorItem[] = imported.items.map((item) => ({
        ...item,
        force:
          item.type === "unit" && item.force.trim()
            ? canonicalForceNames.get(item.force.trim().toLowerCase()) ??
              item.force
            : item.force,
      }));

      // Commit all editor state only after parse + force sync has succeeded.
      setTitle(imported.title);
      setMapImage(imported.mapImage);
      setMapWidth(imported.mapWidth);
      setMapHeight(imported.mapHeight);
      setDuration(imported.duration);
      setCurrentTime(0);
      setIsPlaying(false);
      setItems(importedItems);
      setSelectedKey(null);
      setDraftItem(null);
      setJsonOpen(false);
      setValidationDialog(null);
      setShowValidationErrors(false);
      setForces(synced);
      setForcesError("");
      // Abort/refetch any older force-list request that may have started
      // before this import and could otherwise overwrite the synced catalog.
      setForceLoadVersion((version) => version + 1);

      setImportNotice({
        kind: "success",
        message: t("creator.importSuccess", {
          count: plan.missingDefinitions.length,
        }),
      });
    } catch (error) {
      setImportNotice({
        kind: "error",
        message: t("creator.importFailed", {
          message:
            error instanceof Error
              ? error.message
              : t("creator.importUnknownError"),
        }),
      });
    } finally {
      setIsImporting(false);
    }
  };
  const importBattleJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await importBattleText(await file.text());
  };

  useEffect(() => {
    const pending = consumeDistributedJson();
    if (pending) {
        void importBattleText(pending);
    }
    // Runs once on initial Creator mount; the import itself remains transactional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


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
            const previousPoint = item.timeline.find(
              (entry) => entry.t === currentTime
            );
            const point: Point = {
              ...previousPoint,
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
        ...(item.description.trim()
          ? { description: item.description.trim() }
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
        ...(item.description.trim()
          ? { description: item.description.trim() }
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
            ...(item.description.trim()
              ? { description: item.description.trim() }
              : {}),
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
      creatorState: {
        version: 2,
        coordinateOrigin: "center",
        duration,
        items: validItems.map((item) => ({
          ...item,
          timeline: item.timeline.map((point) => ({ ...point })),
          ...(item.groupMoveTimeline
            ? {
                groupMoveTimeline: item.groupMoveTimeline.map((point) => ({
                  ...point,
                })),
              }
            : {}),
          ...(item.groupOrigin
            ? { groupOrigin: { ...item.groupOrigin } }
            : {}),
        })),
      },
      timeline: {
        ...(camera.length ? { camera } : {}),
        units: unitTimeline,
        ...(hierarchy.length ? { hierarchy: hierarchyTimeline } : {}),
        ...(Object.keys(charTimeline).length
          ? { characters: charTimeline }
          : {}),
      },
    };
  }, [items, forces, title, mapImage, mapWidth, mapHeight, duration]);

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
    <main className="flex min-h-dvh w-full min-w-0 flex-col overflow-hidden bg-[#050816] text-gray-100 lg:h-screen lg:min-h-0">
      <header className="shrink-0 border-b border-gray-700 bg-[#0b1020] px-2 py-2 sm:px-4 lg:flex lg:h-16 lg:items-center lg:px-4 lg:py-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3 lg:w-full lg:flex-nowrap lg:gap-3">
        <Link
          href="/home"
          className="min-h-11 px-3 py-2 rounded bg-gray-700 lg:min-h-0"
        >
          {t("creator.back")}
        </Link>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("creator.battleName")}
          aria-label={t("creator.battleName")}
          className="min-h-11 min-w-0 flex-1 basis-48 rounded border border-gray-600 bg-[#111827] px-3 py-2 sm:max-w-60 lg:min-h-0 lg:w-52 lg:flex-none lg:basis-auto"
        />
        <ImageAssetPicker
          label={t("creator.mapImage")}
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
          aria-label={t("creator.mapWidth")}
          className="min-h-11 w-24 rounded border border-gray-600 bg-[#111827] px-2 py-2 lg:min-h-0"
        />
        <input
          type="number"
          min={1}
          value={mapHeight}
          onChange={(e) =>
            setMapHeight(Math.max(1, Number(e.target.value)))
          }
          title="map.height"
          aria-label={t("creator.mapHeight")}
          className="min-h-11 w-24 rounded border border-gray-600 bg-[#111827] px-2 py-2 lg:min-h-0"
        />
        <span className="rounded border border-gray-700 bg-[#111827] px-3 py-2 text-xs text-gray-300">
          {t("creator.origin")}
        </span>
        <input
          id="creator-json-import"
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={importBattleJson}
        />
        <button
          type="button"
          disabled={isImporting}
          onClick={() =>
            (
              document.getElementById(
                "creator-json-import"
              ) as HTMLInputElement | null
            )?.click()
          }
          className="min-h-11 px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 lg:min-h-0"
        >
          {isImporting
            ? t("creator.importingJson")
            : t("creator.importJson")}
        </button>
        <button
          onClick={requestJsonPreview}
          className="min-h-11 px-3 py-2 rounded bg-slate-600 lg:min-h-0"
        >
          {t("creator.previewJson")}
        </button>
        <button
          onClick={requestJsonSave}
          className="min-h-11 px-3 py-2 rounded bg-emerald-600 lg:min-h-0"
        >
          {t("creator.saveJson")}
        </button>
        </div>
      </header>

      {importNotice && (
        <div
          role={importNotice.kind === "error" ? "alert" : "status"}
          aria-live="polite"
          className={
            "shrink-0 border-b px-4 py-2 text-sm " +
            (importNotice.kind === "error"
              ? "border-red-800 bg-red-950 text-red-200"
              : "border-emerald-800 bg-emerald-950 text-emerald-200")
          }
        >
          {importNotice.message}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-auto lg:flex-row lg:overflow-hidden">
        <aside
          className={
            "min-h-0 shrink-0 border-b border-gray-700 bg-[#0b1020] transition-all flex flex-col overflow-hidden lg:h-full lg:border-b-0 lg:border-r " +
            (sidebarOpen
              ? "w-full max-h-[40dvh] lg:max-h-none lg:w-80"
              : "h-11 w-full lg:h-full lg:w-12")
          }
        >
          <button
            onClick={() => setSidebarOpen((value) => !value)}
            className="min-h-11 w-full border-b border-gray-700 lg:h-10 lg:min-h-0"
          >
            {sidebarOpen ? t("creator.sidebarOpen") : t("creator.sidebarClosed")}
          </button>

          {sidebarOpen && (
            <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
              <div className="shrink-0 grid grid-cols-2 border-b border-gray-700" role="tablist" aria-label={t("creator.sidebarLabel")}>
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
                  {t("creator.elements")}
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
                  {t("creator.hierarchy")}
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
                        title={t(palette.tooltipKey)}
                        className="min-h-20 rounded-lg border border-gray-700 bg-[#111827] hover:border-blue-400 p-2 text-left focus-visible:border-yellow-300"
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
                  title={title || t("creator.defaultTitle")}
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

        <section className="flex min-h-[30rem] min-w-0 flex-1 flex-col lg:min-h-0">
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
            aria-label={t("creator.editorLabel")}
            className="relative m-2 min-h-[20rem] flex-1 overflow-hidden border border-gray-600 bg-[#0a1020] sm:m-3 sm:min-h-[24rem] lg:m-4 lg:min-h-0"
            style={{
              backgroundImage: mapImage
                ? `linear-gradient(rgba(255,255,255,.09) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.09) 1px, transparent 1px), url("${mapImage}")`
                : "linear-gradient(rgba(255,255,255,.09) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.09) 1px, transparent 1px)",
              backgroundSize: mapImage
                ? "50px 50px, 50px 50px, 100% 100%"
                : "50px 50px",
              backgroundPosition: mapImage
                ? "calc(50% + 25px) calc(50% + 25px), calc(50% + 25px) calc(50% + 25px), center center"
                : "calc(50% + 25px) calc(50% + 25px)",
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
                      title={t("creator.cameraRange")}
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
                          : " / " + t("creator.idMissing")) +
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

          <div className="shrink-0 border-t border-gray-700 bg-[#111827] px-3 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 lg:flex-nowrap lg:gap-3">
              <button
                type="button"
                onClick={() => {
                  if (currentTime >= duration) {
                    setCurrentTime(0);
                  }
                  setIsPlaying(true);
                }}
                className="min-h-11 px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 lg:min-h-0 lg:py-1"
              >
                {t("creator.play")}
              </button>
              <button
                type="button"
                onClick={() => setIsPlaying(false)}
                className="min-h-11 px-3 py-2 rounded bg-gray-600 hover:bg-gray-500 lg:min-h-0 lg:py-1"
              >
                {t("creator.stop")}
              </button>
              <span className="min-w-20 text-sm lg:w-20" role="status" aria-live="polite">
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
                className="min-w-40 flex-1 basis-48 lg:basis-auto"
              />
              <label className="flex min-h-11 items-center gap-2 text-xs lg:min-h-0">
                {t("creator.maxSeconds")}
                <input
                  type="number"
                  min={1}
                  value={duration}
                  onChange={(e) =>
                    setDuration(
                      Math.max(1, Number(e.target.value))
                    )
                  }
                  className="min-h-9 w-20 rounded border border-gray-600 bg-[#0b1020] px-2 py-1 lg:min-h-0"
                />
              </label>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {t("creator.timelineHelp")}
            </p>
          </div>
        </section>

        <aside className="max-h-[45dvh] w-full shrink-0 overflow-y-auto border-t border-gray-700 bg-[#0b1020] lg:h-full lg:max-h-none lg:w-80 lg:border-l lg:border-t-0">
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 sm:p-8" role="dialog" aria-modal="true" aria-labelledby="creator-validation-title">
          <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-auto rounded-xl border border-red-800 bg-[#111827] p-4 shadow-2xl sm:p-6">
            <h2 id="creator-validation-title" className="text-lg font-semibold mb-4">
              {t("creator.validationTitle")}
            </h2>
            <p className="text-sm leading-7 text-gray-200">
              {validationDialog === "preview"
                ? t("creator.validationPreview")
                : t("creator.validationSave")}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-8" role="dialog" aria-modal="true" aria-labelledby="creator-json-title">
          <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col rounded-xl border border-gray-700 bg-[#0b1020]">
            <div className="flex items-center border-b border-gray-700 p-3">
              <strong id="creator-json-title">{t("creator.generatedJson")}</strong>
              <button
                className="ml-auto px-3 py-1 rounded bg-gray-700"
                onClick={() => setJsonOpen(false)}
              >
                {t("common.close")}
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
  const { t } = useI18n();
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
          {t("creator.hierarchyHelp")}
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
  const { t } = useI18n();
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
            : t("creator.idMissing"))
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
            : t("creator.idMissing")}
        </span>
        {item.destroyEnabled && (
          <span className="ml-2 text-red-400">
            {t("creator.destroyed")}
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
  const { t } = useI18n();
  const inputId = useId();
  const helpId = useId();
  const describedBy = invalid || help ? helpId : undefined;
  const step = (delta: number) => {
    const numeric = Number(value);
    onChange(String((Number.isFinite(numeric) ? numeric : 0) + delta));
  };

  return (
    <div className="block mb-3">
      <label htmlFor={inputId} className="block text-xs text-gray-300 mb-1">
        {label}
        {required && (
          <span className="ml-1 text-red-300" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <div className={coordinate ? "flex items-center gap-2" : undefined}>
        {coordinate && (
          <button
            type="button"
            onClick={() => step(-1)}
            className="min-h-9 min-w-9 rounded border border-gray-600 bg-gray-700 px-2 hover:bg-gray-600"
            aria-label={t("creator.decrement", { label })}
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
          onChange={(event) => onChange(event.target.value)}
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
            aria-label={t("creator.increment", { label })}
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
          {required && invalid ? t("creator.required") : help}
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
  const { t } = useI18n();
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
        {t("creator.properties")}
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        {item.type} / {placed ? t("creator.placed") : t("creator.unplaced")}
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
        label={item.type === "camera" ? t("creator.displayName") : "name"}
        value={item.name}
        onChange={(name) => onChange({ name })}
      />

      {item.type !== "camera" && (
        <label className="mb-3 block text-xs text-gray-300">
          {t("creator.description")}
          <textarea
            value={item.description}
            onChange={(event) => onChange({ description: event.target.value })}
            rows={5}
            maxLength={2000}
            placeholder={t("creator.descriptionPlaceholder")}
            className="mt-1 block w-full resize-y rounded border border-gray-600 bg-[#111827] px-3 py-2 text-sm leading-5"
          />
          <span className="mt-1 block text-[11px] text-gray-500">
            {t("creator.descriptionHelp")}
          </span>
        </label>
      )}

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
          label={t("creator.direction")}
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
            {t("creator.selectParent")}
            <select
              value={selectedParentValue}
              onChange={(event) => {
                if (event.target.value !== "__manual__") {
                  onChange({ parentId: event.target.value });
                }
              }}
              className="mt-1 w-full rounded border border-gray-600 bg-[#111827] px-3 py-2 text-sm"
            >
              <option value="">{t("creator.noParent")}</option>
              {parentOptions.map((candidate) => (
                <option key={candidate.key} value={candidate.id.trim()}>
                  {getCreatorDisplayName(candidate)} ({candidate.id.trim()})
                </option>
              ))}
              {selectedParentValue === "__manual__" && (
                <option value="__manual__" disabled>
                  {t("creator.currentInput", { value: item.parentId })}
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
                ? t("creator.parentInvalid", { type: String(expected) })
                : t("creator.parentHelp")
            }
          />
        </>
      )}

      {isCreatorBattleRootOnly(item.type) && (
        <div className="mb-3 rounded border border-gray-700 bg-[#111827] p-3 text-xs text-gray-400">
          {t("creator.rootParent")}
        </div>
      )}

      {isHierarchy(item.type) && (
        <div className="mb-3 rounded border border-gray-700 bg-[#111827] p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={item.groupMove} onChange={(event) => onChange({ groupMove: event.target.checked })} />
            {t("creator.groupMove")}
          </label>
          <p className="mt-2 text-[11px] leading-5 text-gray-500">
            {t("creator.groupMoveHelp")}
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
          help={t("creator.cameraZoomHelp")}
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
            {t("creator.destroyFlag")}
          </label>

          <p className="mt-2 text-[11px] leading-5 text-gray-500">
            {t("creator.destroyHelp")}
          </p>

          {item.destroyEnabled && (
            <div className="mt-3">
              <Field
                label={t("creator.destroyAt")}
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
        {t("creator.currentTime", { time: currentTime.toFixed(1) })}
        <br />
        {t("creator.appearAt", { time: Number.isFinite(item.appearAt) ? item.appearAt.toFixed(1) : "-" })}
        <br />
        {t("creator.keyframes", { count: item.timeline.length })}
      </div>

      {placed && (
        <button
          type="button"
          onClick={onDelete}
          className="mt-4 w-full rounded bg-red-700 py-2 hover:bg-red-800"
        >
          {t("creator.delete")}
        </button>
      )}
    </div>
  );
}
