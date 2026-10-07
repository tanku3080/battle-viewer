import type { GroupMoveKeyframe } from "@/types/battle";
import { isCreatorParentOf, type CreatorHierarchyType } from "./hierarchy";
import { getCreatorPositionAt, type CreatorTimelinePoint } from "./timeline";

export type CreatorGroupMovePoint = GroupMoveKeyframe;
export type CreatorMovementPoint = CreatorTimelinePoint & {
  explicit?: boolean;
  inherited?: boolean;
};
export type CreatorMovementItem = {
  key: string;
  type: CreatorHierarchyType;
  id: string;
  parentId: string;
  groupMove: boolean;
  groupMoveTimeline?: CreatorGroupMovePoint[];
  groupOrigin?: { key: string; x: number; y: number };
  x: number;
  y: number;
  appearAt: number;
  timeline: CreatorMovementPoint[];
};

export function getCreatorGroupMoveAt(item: Pick<CreatorMovementItem, "groupMove" | "groupMoveTimeline">, t: number): boolean {
  const point = [...(item.groupMoveTimeline ?? [])]
    .filter((entry) => entry.t <= t)
    .sort((a, b) => b.t - a.t)[0];
  return point?.enabled ?? item.groupMove;
}

function ancestorsOf<T extends CreatorMovementItem>(items: T[], item: T): T[] {
  let cursor = item;
  const ancestors: T[] = [];
  const visited = new Set([item.key]);
  while (true) {
    const parent = items.find((candidate) => isCreatorParentOf(candidate, cursor));
    if (!parent || visited.has(parent.key)) return ancestors;
    visited.add(parent.key);
    ancestors.push(parent);
    cursor = parent;
  }
}

/** Only the outermost enabled ancestor at this time contributes displacement. */
export function getCreatorGroupLeader<T extends CreatorMovementItem>(items: T[], item: T, t = Number.POSITIVE_INFINITY): T | null {
  return ancestorsOf(items, item).reverse().find((parent) => getCreatorGroupMoveAt(parent, t)) ?? null;
}

export function initializeCreatorGroupOrigin<T extends CreatorMovementItem>(items: T[], item: T): T {
  const leader = getCreatorGroupLeader(items, item, item.appearAt);
  return leader ? {
    ...item,
    groupOrigin: { key: leader.key, ...getCreatorItemPositionAt(items, leader, item.appearAt) },
  } : item;
}

function groupDisplacement<T extends CreatorMovementItem>(items: T[], item: T, start: number, end: number) {
  const displacement = { x: 0, y: 0 };
  if (end <= start) return displacement;
  const times = new Set([start, end]);
  ancestorsOf(items, item).forEach((parent) => parent.groupMoveTimeline?.forEach((point) => {
    if (point.t > start && point.t < end) times.add(point.t);
  }));
  const sorted = [...times].sort((a, b) => a - b);
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const leader = getCreatorGroupLeader(items, item, sorted[index]);
    if (!leader) continue;
    const from = getCreatorItemPositionAt(items, leader, sorted[index]);
    const to = getCreatorItemPositionAt(items, leader, sorted[index + 1]);
    displacement.x += to.x - from.x;
    displacement.y += to.y - from.y;
  }
  return displacement;
}

export function getCreatorItemPositionAt<T extends CreatorMovementItem>(items: T[], item: T, t: number): { x: number; y: number } {
  const points = [...item.timeline].sort((a, b) => a.t - b.t);
  const first = points[0];
  const fallback = { x: item.x, y: item.y };
  if (!first) return fallback;
  const leader = getCreatorGroupLeader(items, item, first.t);
  const initial = { x: first.x, y: first.y };
  if (leader && !first.explicit && item.groupOrigin?.key === leader.key &&
      first.t <= Math.min(...leader.timeline.map((point) => point.t))) {
    const position = getCreatorItemPositionAt(items, leader, first.t);
    initial.x += position.x - item.groupOrigin.x;
    initial.y += position.y - item.groupOrigin.y;
  }
  const follow = (time: number) => {
    const delta = groupDisplacement(items, item, first.t, time);
    return { x: initial.x + delta.x, y: initial.y + delta.y };
  };
  const explicit = points.filter((point) => point.explicit);
  if (!explicit.length) return follow(Math.max(t, first.t));

  // An individually drawn path has absolute world coordinates. Group edits
  // cannot overwrite its endpoints or the interpolation between them.
  const last = explicit[explicit.length - 1];
  if (t <= last.t) {
    return getCreatorPositionAt(
      first.explicit ? explicit : [{ ...first, ...follow(first.t) }, ...explicit], t, fallback
    );
  }
  const delta = groupDisplacement(items, item, last.t, t);
  return { x: last.x + delta.x, y: last.y + delta.y };
}

export function recordCreatorPosition<T extends CreatorMovementItem>(
  item: T, x: number, y: number, t: number,
  extra: Pick<CreatorTimelinePoint, "dir" | "zoom"> = {},
  explicit = true
): T {
  const previous = item.timeline.find((point) => point.t === t);
  return {
    ...item, x, y,
    appearAt: Number.isFinite(item.appearAt) ? Math.min(item.appearAt, t) : t,
    timeline: [
      ...item.timeline.filter((point) => point.t !== t),
      { ...previous, t, x, y, ...extra, explicit, inherited: false },
    ].sort((a, b) => a.t - b.t),
  };
}

export function setCreatorGroupMove<T extends CreatorMovementItem>(items: T[], key: string, enabled: boolean, t: number): T[] {
  const source = items.find((item) => item.key === key);
  if (!source || getCreatorGroupMoveAt(source, t) === enabled) return items;
  const next = items.map((item) => item.key === key ? {
    ...item,
    groupMoveTimeline: [
      ...(item.groupMoveTimeline ?? []).filter((point) => point.t !== t),
      { t, enabled },
    ].sort((a, b) => a.t - b.t),
  } : item);
  return syncCreatorGroupOrigins(items, next, t);
}

/** Keep the full path before a mode change instead of rewriting the spawn key. */
export function syncCreatorGroupOrigins<T extends CreatorMovementItem>(previous: T[], next: T[], t: number): T[] {
  // Also support callers supplying the old boolean patch shape.
  let result = next.map((item) => {
    const old = previous.find((candidate) => candidate.key === item.key);
    if (!old || old.groupMove === item.groupMove) return item;
    return {
      ...item,
      groupMove: old.groupMove,
      groupMoveTimeline: [
        ...(item.groupMoveTimeline ?? []).filter((point) => point.t !== t),
        { t, enabled: item.groupMove },
      ].sort((a, b) => a.t - b.t),
    };
  });
  const order = ["legion", "corps", "division", "regiment", "unit", "character", "camera"];
  for (const item of [...result].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))) {
    const old = previous.find((candidate) => candidate.key === item.key);
    if (!old || !item.timeline.length) continue;
    const switchTime = Math.max(t, Math.min(...item.timeline.map((point) => point.t)));
    const leader = getCreatorGroupLeader(result, item, switchTime);
    const oldLeader = getCreatorGroupLeader(previous, old, switchTime);
    if (leader?.key === oldLeader?.key) continue;
    const current = getCreatorItemPositionAt(previous, old, switchTime);
    const origin = leader ? getCreatorItemPositionAt(result, leader, switchTime) : null;
    const past = buildCreatorWorldTimeline(previous, old)
      .filter((point) => point.t < switchTime)
      .map((point) => ({
        ...point, explicit: true,
        inherited: !old.timeline.some((source) => source.t === point.t && source.explicit && !source.inherited),
      }));
    const source = old.timeline.find((point) => point.t === switchTime);
    const atSpawn = switchTime === Math.min(...old.timeline.map((point) => point.t));
    const updated: T = {
      ...item,
      x: current.x,
      y: current.y,
      groupOrigin: leader && origin ? { key: leader.key, ...origin } : undefined,
      timeline: [
        ...past,
        {
          ...source, t: switchTime, ...current,
          explicit: !atSpawn || source?.explicit === true,
          inherited: !atSpawn && (!source?.explicit || source.inherited === true),
        },
        ...item.timeline.filter((point) => point.t > switchTime && !point.inherited),
      ].sort((a, b) => a.t - b.t),
    };
    result = result.map((candidate) => candidate.key === item.key ? updated : candidate);
  }
  return result;
}

/** Bake exact piecewise-linear world paths so Viewer does not apply the flag twice. */
export function buildCreatorWorldTimeline<T extends CreatorMovementItem>(items: T[], item: T): CreatorTimelinePoint[] {
  if (!item.timeline.length) return [];
  const times = new Set(item.timeline.map((point) => point.t));
  const firstTime = Math.min(...times);
  ancestorsOf(items, item).forEach((parent) => {
    [...parent.timeline, ...(parent.groupMoveTimeline ?? [])].forEach((point) => {
      if (point.t >= firstTime) times.add(point.t);
    });
  });
  return [...times].sort((a, b) => a - b).map((t) => {
    const source = [...item.timeline].reverse().find((point) => point.t <= t) ?? item.timeline[0];
    return {
      t, ...getCreatorItemPositionAt(items, item, t),
      ...(source.dir !== undefined ? { dir: source.dir } : {}),
      ...(source.zoom !== undefined ? { zoom: source.zoom } : {}),
    };
  });
}

export function stepCreatorCoordinate(value: string | number, key: string): number | null {
  if (key !== "ArrowUp" && key !== "ArrowDown") return null;
  const number = value === "" ? 0 : Number(value);
  return (Number.isFinite(number) ? number : 0) + (key === "ArrowUp" ? 1 : -1);
}
