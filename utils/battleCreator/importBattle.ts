import type { HierarchyLevel, TimelinePoint } from "@/types/battle";
import type { RawBattleJson } from "@/utils/battle/loadBattleJson";
import type { ForceDefinition } from "@/utils/battle/forces";
import type {
  CreatorGroupMovePoint,
  CreatorMovementPoint,
} from "@/utils/battleCreator/movement";
import { validateCoordinateMap } from "@/utils/battle/coordinates";

export type CreatorSpatialType =
  | "unit"
  | "character"
  | "legion"
  | "corps"
  | "division"
  | "regiment"
  | "camera";

export type CreatorEditorItem = {
  key: string;
  type: CreatorSpatialType;
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
  timeline: CreatorMovementPoint[];
};

export type CreatorImportState = {
  title: string;
  mapImage: string;
  mapWidth: number;
  mapHeight: number;
  duration: number;
  items: CreatorEditorItem[];
  forceDefinitions: ForceDefinition[];
  referencedForces: string[];
};

type CreatorStateV1 = {
  version: 1;
  duration?: number;
  items: unknown[];
};

type RawCreatorBattleJson = RawBattleJson & {
  creatorState?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalFinite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Number.NaN;
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function importedKey(type: CreatorSpatialType, id: string, index: number) {
  return `import:${type}:${id || index}`;
}

function toCreatorPoint<T extends TimelinePoint>(
  point: T,
  map: RawBattleJson["map"]
): T {
  if ((map.coordinateOrigin ?? "top-left") === "center") return point;
  return {
    ...point,
    x: point.x - map.width / 2,
    y: map.height / 2 - point.y,
  };
}

function normalizeTimeline(
  value: unknown,
  map: RawBattleJson["map"]
): CreatorMovementPoint[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((point) => ({
      t: finite(point.t, Number.NaN),
      x: finite(point.x, Number.NaN),
      y: finite(point.y, Number.NaN),
      ...(typeof point.dir === "number" && Number.isFinite(point.dir)
        ? { dir: point.dir }
        : {}),
      ...(typeof point.zoom === "number" && Number.isFinite(point.zoom)
        ? { zoom: point.zoom }
        : {}),
      explicit:
        typeof point.explicit === "boolean" ? point.explicit : true,
      inherited:
        typeof point.inherited === "boolean" ? point.inherited : false,
    }))
    .filter(
      (point) =>
        Number.isFinite(point.t) &&
        Number.isFinite(point.x) &&
        Number.isFinite(point.y)
    )
    .map((point) => toCreatorPoint(point, map))
    .sort((a, b) => a.t - b.t);
}

function parseGroupTimeline(value: unknown): CreatorGroupMovePoint[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const timeline = value
    .filter(isRecord)
    .map((entry) => ({
      t: finite(entry.t, Number.NaN),
      enabled: entry.enabled === true,
    }))
    .filter((entry) => Number.isFinite(entry.t))
    .sort((a, b) => a.t - b.t);
  return timeline.length ? timeline : undefined;
}

function parseSnapshotItem(
  value: unknown,
  index: number,
  map: RawBattleJson["map"]
): CreatorEditorItem | null {
  if (!isRecord(value)) return null;
  const allowed: CreatorSpatialType[] = [
    "unit",
    "character",
    "legion",
    "corps",
    "division",
    "regiment",
    "camera",
  ];
  if (
    typeof value.type !== "string" ||
    !allowed.includes(value.type as CreatorSpatialType)
  ) {
    return null;
  }

  const type = value.type as CreatorSpatialType;
  const id = stringValue(value.id);
  const timeline = normalizeTimeline(value.timeline, map);
  const first = timeline[0];
  const rawOrigin = isRecord(value.groupOrigin) ? value.groupOrigin : null;
  const origin =
    rawOrigin &&
    typeof rawOrigin.key === "string" &&
    Number.isFinite(rawOrigin.x) &&
    Number.isFinite(rawOrigin.y)
      ? toCreatorPoint(
          {
            key: rawOrigin.key,
            x: Number(rawOrigin.x),
            y: Number(rawOrigin.y),
          },
          map
        )
      : undefined;

  const fallbackX = finite(value.x, first?.x ?? 0);
  const fallbackY = finite(value.y, first?.y ?? 0);
  const normalizedFallback = toCreatorPoint(
    { x: fallbackX, y: fallbackY },
    map
  );

  return {
    key: stringValue(value.key, importedKey(type, id, index)),
    type,
    id,
    name: stringValue(value.name),
    description: stringValue(value.description),
    force: stringValue(value.force),
    color: stringValue(value.color),
    icon: stringValue(value.icon),
    parentId: stringValue(value.parentId),
    groupMove: value.groupMove === true,
    groupMoveTimeline: parseGroupTimeline(value.groupMoveTimeline),
    groupOrigin: origin
      ? { key: origin.key, x: origin.x, y: origin.y }
      : undefined,
    x: normalizedFallback.x,
    y: normalizedFallback.y,
    zoom: optionalFinite(value.zoom),
    dir: optionalFinite(value.dir),
    appearAt: finite(value.appearAt, first?.t ?? Number.NaN),
    destroyEnabled: value.destroyEnabled === true,
    destroyAt: optionalFinite(value.destroyAt),
    timeline,
  };
}

function parseCreatorState(value: unknown): CreatorStateV1 | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.items)) {
    return null;
  }
  return {
    version: 1,
    duration:
      typeof value.duration === "number" && Number.isFinite(value.duration)
        ? value.duration
        : undefined,
    items: value.items,
  };
}

function rawTimeline(
  raw: RawBattleJson,
  kind: "units" | "characters" | "hierarchy",
  id: string,
  inline?: TimelinePoint[]
) {
  const collection = raw.timeline?.[kind] as
    | Record<string, TimelinePoint[]>
    | undefined;
  return collection?.[id] ?? inline ?? [];
}

function makeFallbackItem(args: {
  type: CreatorSpatialType;
  id: string;
  name?: string;
  description?: string;
  force?: string;
  color?: string;
  icon?: string | null;
  parentId?: string | null;
  groupMove?: boolean;
  groupMoveTimeline?: CreatorGroupMovePoint[];
  timeline?: TimelinePoint[];
  fallback?: { x: number; y: number };
  zoom?: number;
  appearAt?: number;
  destroyAt?: number;
  index: number;
  map: RawBattleJson["map"];
}): CreatorEditorItem {
  const timeline = normalizeTimeline(args.timeline ?? [], args.map);
  const first = timeline[0];
  const fallback = toCreatorPoint(
    args.fallback ?? {
      x: first?.x ?? 0,
      y: first?.y ?? 0,
    },
    args.map
  );

  return {
    key: importedKey(args.type, args.id, args.index),
    type: args.type,
    id: args.id,
    name: args.name ?? "",
    description: args.description ?? "",
    force: args.force ?? "",
    color: args.color ?? "",
    icon: args.icon ?? "",
    parentId: args.parentId ?? "",
    groupMove: args.groupMove === true,
    groupMoveTimeline: args.groupMoveTimeline,
    x: fallback.x,
    y: fallback.y,
    zoom:
      typeof args.zoom === "number" && Number.isFinite(args.zoom)
        ? args.zoom
        : Number.NaN,
    dir: first?.dir ?? Number.NaN,
    appearAt:
      typeof args.appearAt === "number" && Number.isFinite(args.appearAt)
        ? args.appearAt
        : first?.t ?? Number.NaN,
    destroyEnabled:
      typeof args.destroyAt === "number" && Number.isFinite(args.destroyAt),
    destroyAt:
      typeof args.destroyAt === "number" && Number.isFinite(args.destroyAt)
        ? args.destroyAt
        : Number.NaN,
    timeline,
  };
}

function fallbackItems(raw: RawBattleJson): CreatorEditorItem[] {
  const items: CreatorEditorItem[] = [];
  let index = 0;

  for (const unit of raw.units ?? []) {
    items.push(
      makeFallbackItem({
        type: "unit",
        id: unit.id,
        name: unit.name,
        description: unit.description,
        force: unit.force,
        color: unit.color,
        icon: unit.icon,
        timeline: rawTimeline(raw, "units", unit.id, unit.timeline),
        destroyAt: unit.destroyAt,
        index: index++,
        map: raw.map,
      })
    );
  }

  for (const character of raw.characters ?? []) {
    items.push(
      makeFallbackItem({
        type: "character",
        id: character.id,
        name: character.name,
        description: character.description,
        icon: character.icon,
        timeline: rawTimeline(
          raw,
          "characters",
          character.id,
          character.timeline
        ),
        destroyAt: character.destroyAt,
        index: index++,
        map: raw.map,
      })
    );
  }

  const hierarchyNodes = raw.hierarchy?.nodes ?? {};
  for (const [id, node] of Object.entries(hierarchyNodes)) {
    const level = node.level as HierarchyLevel | undefined;
    if (
      level !== "legion" &&
      level !== "corps" &&
      level !== "division" &&
      level !== "regiment"
    ) {
      continue;
    }

    items.push(
      makeFallbackItem({
        type: level,
        id,
        name: node.name,
        description: node.description,
        icon: node.icon,
        parentId: node.parentId,
        groupMove: node.groupMove,
        groupMoveTimeline: node.groupMoveTimeline,
        timeline: rawTimeline(raw, "hierarchy", id, node.timeline),
        fallback: node.pos,
        appearAt: node.appearAt,
        destroyAt: node.destroyAt,
        index: index++,
        map: raw.map,
      })
    );
  }

  const camera = raw.timeline?.camera ?? raw.camera ?? [];
  if (camera.length) {
    const timeline = normalizeTimeline(camera, raw.map);
    const first = timeline[0];
    items.push(
      makeFallbackItem({
        type: "camera",
        id: "",
        name: "Camera",
        timeline: camera,
        zoom:
          typeof first?.zoom === "number" && Number.isFinite(first.zoom)
            ? first.zoom
            : 1,
        index: index++,
        map: raw.map,
      })
    );
  }

  return items;
}

function maxTimelineTime(items: CreatorEditorItem[]) {
  let max = 0;
  for (const item of items) {
    for (const point of item.timeline) max = Math.max(max, point.t);
    for (const point of item.groupMoveTimeline ?? []) max = Math.max(max, point.t);
    if (item.destroyEnabled && Number.isFinite(item.destroyAt)) {
      max = Math.max(max, item.destroyAt);
    }
  }
  return max;
}

export function collectImportForces(raw: RawBattleJson) {
  const definitions: ForceDefinition[] = [];
  const names = new Set<string>();
  const addDefinition = (force: ForceDefinition) => {
    const key = force.name.trim().toLowerCase();
    if (!key || names.has(key)) return;
    if (!/^#[0-9a-f]{6}$/i.test(force.color)) return;
    names.add(key);
    definitions.push({
      name: force.name.trim(),
      color: force.color,
    });
  };

  for (const force of raw.forces ?? []) addDefinition(force);

  const referenced = new Map<string, string>();
  for (const unit of raw.units ?? []) {
    const forceName = unit.force?.trim();
    if (!forceName) continue;
    referenced.set(forceName.toLowerCase(), forceName);
    if (unit.color) addDefinition({ name: forceName, color: unit.color });
  }

  return {
    definitions,
    referencedForces: [...referenced.values()],
  };
}

export function importCreatorBattleJson(
  raw: RawCreatorBattleJson
): CreatorImportState {
  validateCoordinateMap(raw.map);

  const creatorState = parseCreatorState(raw.creatorState);
  const items = creatorState
    ? creatorState.items
        .map((item, index) => parseSnapshotItem(item, index, raw.map))
        .filter((item): item is CreatorEditorItem => item !== null)
    : fallbackItems(raw);

  const { definitions, referencedForces } = collectImportForces(raw);
  const durationCandidate =
    creatorState?.duration ??
    raw.meta?.duration ??
    maxTimelineTime(items);

  return {
    title:
      typeof raw.title === "string"
        ? raw.title
        : typeof raw.meta?.title === "string"
          ? raw.meta.title
          : "Battle",
    mapImage: typeof raw.map.image === "string" ? raw.map.image : "",
    mapWidth: raw.map.width,
    mapHeight: raw.map.height,
    duration: Math.max(1, Math.ceil(durationCandidate || 60)),
    items,
    forceDefinitions: definitions,
    referencedForces,
  };
}
