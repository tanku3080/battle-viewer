"use client";

import type {
  BattleData,
  BattleEvent,
  BattleTimeline,
  Character,
  TimelinePoint,
  Unit,
  UnitDefinition,
} from "@/types/battle";
import {
  buildHierarchyNodesFromJson,
  sortEvents,
  type HierarchySourceNode,
} from "./hierarchy";

export type RawBattleJson = {
  meta?: { title?: string; duration?: number };
  title?: string;
  map: BattleData["map"];
  hierarchy?: { legions?: HierarchySourceNode[] };
  units?: UnitDefinition[];
  characters?: Omit<Character, "timeline" | "appearAt" | "disappearAt">[];
  events?: BattleEvent[];
  timeline?: BattleTimeline;
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

/**
 * dir が存在しない TimelinePoint に向きを自動付与する
 */
function fillDir(timeline: TimelinePoint[]): TimelinePoint[] {
  if (!timeline.length) return timeline;

  return timeline.map((p, i) => {
    if (p.dir !== undefined) return p;

    const next = timeline[i + 1];
    const prev = timeline[i - 1];

    if (next) {
      const dx = next.x - p.x;
      const dy = next.y - p.y;
      return { ...p, dir: Math.atan2(dy, dx) };
    }

    if (prev) {
      return { ...p, dir: prev.dir ?? 0 };
    }

    return { ...p, dir: 0 };
  });
}

function buildUnitDefinitions(
  units: UnitDefinition[] | undefined,
  timeline: BattleTimeline["units"],
  events: BattleEvent[]
) {
  const defs: Record<string, UnitDefinition> = {};
  units?.forEach((u) => {
    defs[u.id] = {
      id: u.id,
      force: u.force,
      name: u.name ?? u.id,
      color: u.color ?? fallbackColor(u.id),
      icon: u.icon ?? null,
    };
  });

  // timeline で定義されているユニットを補完
  Object.keys(timeline).forEach((id) => {
    if (defs[id]) return;
    defs[id] = {
      id,
      force: "unknown",
      name: id,
      color: fallbackColor(id),
      icon: null,
    };
  });

  // reform イベントで生えるユニットを補完
  events.forEach((ev) => {
    if (ev.event !== "reform") return;
    ev.units.forEach((id) => {
      if (defs[id]) return;
      defs[id] = {
        id,
        force: "unknown",
        name: id,
        color: fallbackColor(id),
        icon: null,
      };
    });
  });

  return defs;
}

function buildUnits(
  unitDefs: Record<string, UnitDefinition>,
  timeline: BattleTimeline["units"]
): { units: Unit[]; index: Record<string, Unit> } {
  const units: Unit[] = Object.values(unitDefs).map((def) => {
    const fallbackTimeline: TimelinePoint[] | undefined = undefined;
    const sorted = [...(timeline?.[def.id] ?? fallbackTimeline ?? [])].sort(
      (a, b) => a.t - b.t
    );
    const tl = fillDir(sorted);
    const appearAt = tl.length ? tl[0].t : Number.POSITIVE_INFINITY;
    const disappearAt = tl.length
      ? tl[tl.length - 1].t
      : Number.NEGATIVE_INFINITY;

    return {
      ...def,
      timeline: tl,
      appearAt,
      disappearAt,
    };
  });

  const unitIndex: Record<string, Unit> = {};
  units.forEach((u) => {
    unitIndex[u.id] = u;
  });

  return { units, index: unitIndex };
}

function buildCharacters(
  characters:
    | Omit<Character, "timeline" | "appearAt" | "disappearAt">[]
    | undefined,
  timeline: BattleTimeline["characters"]
): Character[] {
  const ids = new Set<string>();
  characters?.forEach((c) => ids.add(c.id));
  Object.keys(timeline ?? {}).forEach((id) => ids.add(id));

  return Array.from(ids).map((id) => {
    const def = characters?.find((c) => c.id === id);
    const sorted = [...(timeline?.[id] ?? [])].sort((a, b) => a.t - b.t);
    const tl = fillDir(sorted);
    const appearAt = tl.length ? tl[0].t : Number.POSITIVE_INFINITY;
    const disappearAt = tl.length
      ? tl[tl.length - 1].t
      : Number.NEGATIVE_INFINITY;

    return {
      id,
      name: def?.name ?? id,
      icon: def?.icon ?? "",
      timeline: tl,
      appearAt,
      disappearAt,
    };
  });
}

/**
 * JSON 読み込み後の battle データ整形
 * dir 補完などの各種加工をここで実施する
 */
export function loadBattleJson(raw: RawBattleJson): BattleData {
  const cameraTimeline = [...(raw.timeline?.camera ?? raw.camera ?? [])].sort(
    (a, b) => a.t - b.t
  );
  const timeline: BattleTimeline = {
    camera: cameraTimeline,
    units: raw.timeline?.units ?? {},
    characters: raw.timeline?.characters ?? {},
  };

  const orderedEvents = sortEvents(raw.events ?? []);
  const unitDefs = buildUnitDefinitions(
    raw.units ?? [],
    timeline.units,
    orderedEvents
  );
  const { units, index: unitIndex } = buildUnits(unitDefs, timeline.units);
  const characters = buildCharacters(raw.characters, timeline.characters ?? {});

  const { nodes, roots } = buildHierarchyNodesFromJson(
    raw.hierarchy,
    unitIndex
  );

  return {
    title: raw.meta?.title ?? raw.title ?? "Untitled Battle",
    meta: raw.meta,
    map: raw.map,
    camera: timeline.camera ?? [],
    units,
    characters,
    events: orderedEvents,
    timeline,
    hierarchyNodes: nodes,
    hierarchyRoots: roots,
    unitIndex,
  };
}
