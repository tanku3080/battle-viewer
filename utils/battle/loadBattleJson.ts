"use client";

import type {
  BattleData,
  BattleEvent,
  BattleTimeline,
  Character,
  HierarchyNode,
  LODConfig,
  TimelinePoint,
  Unit,
  UnitDefinition,
} from "@/types/battle";
import {
  buildHierarchyNodesFromJson,
  sortEvents,
  type HierarchySourceNode,
} from "./hierarchy";

type RawUnit = Partial<Omit<UnitDefinition, "id">> & {
  id: string;
  timeline?: TimelinePoint[];
};

type RawCharacter = {
  id: string;
  name?: string;
  icon?: string | null;
  timeline?: TimelinePoint[];
};

type RawHierarchy = {
  legions?: HierarchySourceNode[];
  roots?: string[];
  nodes?: Record<string, Partial<HierarchyNode> & { id?: string }>;
};

export type RawBattleJson = {
  lod?: Partial<LODConfig>;
  meta?: { title?: string; duration?: number };
  title?: string;
  map: BattleData["map"];
  hierarchy?: RawHierarchy;
  units?: RawUnit[];
  characters?: RawCharacter[];
  events?: BattleEvent[];
  timeline?: Partial<BattleTimeline>;
  camera?: BattleTimeline["camera"];
};

const FALLBACK_COLORS = [
  "#94a3b8",
  "#f97316",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#eab308",
  "#ef4444",
  "#0ea5e9",
];

function fallbackColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash + id.charCodeAt(i) * 17) % 997;
  }
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

function validateMap(map: BattleData["map"] | undefined) {
  if (!map) throw new Error("map がありません");
  if (!Number.isFinite(map.width) || map.width <= 0) {
    throw new Error("map.width は 0 より大きい数値である必要があります");
  }
  if (!Number.isFinite(map.height) || map.height <= 0) {
    throw new Error("map.height は 0 より大きい数値である必要があります");
  }
}

function fillDir(timeline: TimelinePoint[]): TimelinePoint[] {
  if (!timeline.length) return timeline;

  return timeline.map((p, i) => {
    if (p.dir !== undefined) return p;

    const next = timeline[i + 1];
    const prev = timeline[i - 1];

    if (next) {
      return { ...p, dir: Math.atan2(next.y - p.y, next.x - p.x) };
    }

    return { ...p, dir: prev?.dir ?? 0 };
  });
}

function buildUnitDefinitions(units: RawUnit[]) {
  return units.reduce<Record<string, UnitDefinition>>((acc, unit) => {
    acc[unit.id] = {
      id: unit.id,
      force: unit.force,
      name: unit.name ?? unit.id,
      color: unit.color ?? fallbackColor(unit.id),
      icon: unit.icon ?? null,
    };
    return acc;
  }, {});
}

function buildUnitTimeline(raw: RawBattleJson) {
  const merged: Record<string, TimelinePoint[]> = {
    ...(raw.timeline?.units ?? {}),
  };

  raw.units?.forEach((unit) => {
    if (!(unit.id in merged) && unit.timeline) merged[unit.id] = unit.timeline;
  });

  return merged;
}

function buildCharacterTimeline(raw: RawBattleJson) {
  const merged: Record<string, TimelinePoint[]> = {
    ...(raw.timeline?.characters ?? {}),
  };

  raw.characters?.forEach((character) => {
    if (!(character.id in merged) && character.timeline) {
      merged[character.id] = character.timeline;
    }
  });

  return merged;
}

function buildUnits(
  unitDefs: Record<string, UnitDefinition>,
  timeline: BattleTimeline["units"]
): { units: Unit[]; index: Record<string, Unit> } {
  const units = Object.values(unitDefs).map((def) => {
    const sorted = [...(timeline[def.id] ?? [])].sort((a, b) => a.t - b.t);
    const tl = fillDir(sorted);

    return {
      ...def,
      timeline: tl,
      appearAt: tl.length ? tl[0].t : Number.POSITIVE_INFINITY,
      disappearAt: tl.length ? tl[tl.length - 1].t : Number.NEGATIVE_INFINITY,
    };
  });

  return {
    units,
    index: Object.fromEntries(units.map((unit) => [unit.id, unit])),
  };
}

function buildCharacters(
  definitions: RawCharacter[] | undefined,
  timeline: Record<string, TimelinePoint[]>
): { characters: Character[]; index: Record<string, Character> } {
  const ids = new Set<string>(Object.keys(timeline));
  definitions?.forEach((character) => ids.add(character.id));

  const characters = Array.from(ids).map((id) => {
    const def = definitions?.find((character) => character.id === id);
    const sorted = [...(timeline[id] ?? [])].sort((a, b) => a.t - b.t);
    const tl = fillDir(sorted);

    return {
      id,
      name: def?.name ?? id,
      icon: def?.icon ?? null,
      timeline: tl,
      appearAt: tl.length ? tl[0].t : Number.POSITIVE_INFINITY,
      disappearAt: tl.length ? tl[tl.length - 1].t : Number.NEGATIVE_INFINITY,
    };
  });

  return {
    characters,
    index: Object.fromEntries(
      characters.map((character) => [character.id, character])
    ),
  };
}

function normalizeHierarchy(
  raw: RawHierarchy | undefined,
  unitIndex: Record<string, Unit>
) {
  if (!raw?.nodes) {
    return buildHierarchyNodesFromJson(raw, unitIndex);
  }

  const nodes: Record<string, HierarchyNode> = {};

  Object.entries(raw.nodes).forEach(([key, value]) => {
    const id = value.id ?? key;
    if (!value.level) return;

    nodes[id] = {
      id,
      level: value.level,
      name: value.name ?? id,
      parentId: value.parentId ?? null,
      childrenIds: [...(value.childrenIds ?? [])],
      unitIds: (value.unitIds ?? []).filter((unitId) => !!unitIndex[unitId]),
      status: value.status ?? "active",
      history: [...(value.history ?? [])],
      pos: value.pos,
    };
  });

  const roots =
    raw.roots?.filter((id) => !!nodes[id]) ??
    Object.values(nodes)
      .filter((node) => !node.parentId || !nodes[node.parentId])
      .map((node) => node.id);

  return { nodes, roots };
}

export const DEFAULT_LOD: LODConfig = {
  corps: { min: 0, max: 14 },
  division: { min: 14, max: 28 },
  regiment: { min: 28, max: 56 },
  unit: { min: 56, max: 999 },
  fadeRange: 20,
};

export function loadBattleJson(raw: RawBattleJson): BattleData {
  validateMap(raw?.map);

  const cameraTimeline = [...(raw.timeline?.camera ?? raw.camera ?? [])].sort(
    (a, b) => a.t - b.t
  );

  const timeline: BattleTimeline = {
    camera: cameraTimeline,
    units: buildUnitTimeline(raw),
    characters: buildCharacterTimeline(raw),
  };

  const unitDefs = buildUnitDefinitions(raw.units ?? []);
  const { units, index: unitIndex } = buildUnits(unitDefs, timeline.units);
  const { characters, index: characterIndex } = buildCharacters(
    raw.characters,
    timeline.characters ?? {}
  );
  const hierarchy = normalizeHierarchy(raw.hierarchy, unitIndex);

  const lod: LODConfig = {
    corps: { ...DEFAULT_LOD.corps, ...(raw.lod?.corps ?? {}) },
    division: { ...DEFAULT_LOD.division, ...(raw.lod?.division ?? {}) },
    regiment: { ...DEFAULT_LOD.regiment, ...(raw.lod?.regiment ?? {}) },
    unit: { ...DEFAULT_LOD.unit, ...(raw.lod?.unit ?? {}) },
    fadeRange: raw.lod?.fadeRange ?? DEFAULT_LOD.fadeRange,
  };

  return {
    title: raw.meta?.title ?? raw.title ?? "Untitled Battle",
    meta: raw.meta,
    map: raw.map,
    lod,
    camera: cameraTimeline,
    units,
    characters,
    hierarchy,
    events: sortEvents(raw.events ?? []),
    timeline,
    unitIndex,
    characterIndex,
  };
}
