import { isCreatorParentOf, type CreatorHierarchyType } from "./hierarchy";
import { getCreatorPositionAt, type CreatorTimelinePoint } from "./timeline";

export type CreatorMovementPoint = CreatorTimelinePoint & { explicit?: boolean };
export type CreatorMovementItem = {
  key: string;
  type: CreatorHierarchyType;
  id: string;
  parentId: string;
  groupMove: boolean;
  groupOrigin?: { key: string; x: number; y: number };
  x: number;
  y: number;
  appearAt: number;
  timeline: CreatorMovementPoint[];
};

/** Only the outermost enabled ancestor contributes a group displacement. */
export function getCreatorGroupLeader<T extends CreatorMovementItem>(items: T[], item: T): T | null {
  let cursor = item;
  let leader: T | null = null;
  const visited = new Set([item.key]);
  while (true) {
    const parent = items.find((candidate) => isCreatorParentOf(candidate, cursor));
    if (!parent || visited.has(parent.key)) return leader;
    visited.add(parent.key);
    if (parent.groupMove) leader = parent;
    cursor = parent;
  }
}

export function initializeCreatorGroupOrigin<T extends CreatorMovementItem>(items: T[], item: T): T {
  const leader = getCreatorGroupLeader(items, item);
  return leader ? {
    ...item,
    groupOrigin: { key: leader.key, ...getCreatorItemPositionAt(items, leader, item.appearAt) },
  } : item;
}

export function getCreatorItemPositionAt<T extends CreatorMovementItem>(items: T[], item: T, t: number): { x: number; y: number } {
  const points = [...item.timeline].sort((a, b) => a.t - b.t);
  const first = points[0];
  const fallback = { x: item.x, y: item.y };
  const leader = getCreatorGroupLeader(items, item);
  if (!first || !leader) return getCreatorPositionAt(points, t, fallback);

  const leaderAt = (time: number) => getCreatorItemPositionAt(items, leader, time);
  const leaderSpawn = Math.min(...leader.timeline.map((point) => point.t));
  const origin = first.t > leaderSpawn
    ? leaderAt(first.t)
    : item.groupOrigin?.key === leader.key
    ? item.groupOrigin
    : leaderAt(first.t);
  const follow = (time: number) => {
    const position = leaderAt(time);
    return { x: first.x + position.x - origin.x, y: first.y + position.y - origin.y };
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
  const current = leaderAt(t);
  const anchor = leaderAt(last.t);
  return { x: last.x + current.x - anchor.x, y: last.y + current.y - anchor.y };
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
      { ...previous, t, x, y, ...extra, explicit },
    ].sort((a, b) => a.t - b.t),
  };
}

/** Reparenting or switching the governing flag preserves the current position. */
export function syncCreatorGroupOrigins<T extends CreatorMovementItem>(previous: T[], next: T[], t: number): T[] {
  let result = next;
  const order = ["legion", "corps", "division", "regiment", "unit", "character", "camera"];
  for (const item of [...next].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))) {
    const old = previous.find((candidate) => candidate.key === item.key);
    if (!old || !item.timeline.length) continue;
    const leader = getCreatorGroupLeader(result, item);
    const oldLeader = getCreatorGroupLeader(previous, old);
    if (leader?.key === oldLeader?.key) continue;
    const first = item.timeline[0];
    const current = getCreatorItemPositionAt(previous, old, Math.max(t, first.t));
    const origin = leader ? getCreatorItemPositionAt(result, leader, first.t) : null;
    const leaderNow = leader ? getCreatorItemPositionAt(result, leader, Math.max(t, first.t)) : null;
    let updated: T = {
      ...item,
      groupOrigin: leader && origin ? { key: leader.key, ...origin } : undefined,
      timeline: item.timeline.map((point, index) => index === 0 && !point.explicit ? {
        ...point,
        x: current.x - (leaderNow && origin ? leaderNow.x - origin.x : 0),
        y: current.y - (leaderNow && origin ? leaderNow.y - origin.y : 0),
      } : point),
    };
    if (item.timeline.some((point) => point.explicit) && t >= first.t) {
      updated = recordCreatorPosition(updated, current.x, current.y, t);
    }
    result = result.map((candidate) => candidate.key === item.key ? updated : candidate);
  }
  return result;
}

/** Bake exact piecewise-linear world paths so Viewer does not apply the flag twice. */
export function buildCreatorWorldTimeline<T extends CreatorMovementItem>(items: T[], item: T): CreatorTimelinePoint[] {
  if (!item.timeline.length) return [];
  const times = new Set(item.timeline.map((point) => point.t));
  let leader = getCreatorGroupLeader(items, item);
  const firstTime = Math.min(...times);
  while (leader) {
    leader.timeline.forEach((point) => { if (point.t >= firstTime) times.add(point.t); });
    leader = getCreatorGroupLeader(items, leader);
  }
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
