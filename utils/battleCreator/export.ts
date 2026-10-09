/**
 * Creator keeps NaN for unpositioned editor fields. JSON.stringify turns NaN
 * into null; P2P strict admission requires finite x/y. When an item already has
 * timeline coordinates, use those existing coordinates rather than inventing
 * a position or silently changing its timeline.
 */
export function exportCreatorCoordinate(
  value: number,
  timeline: ReadonlyArray<{ x: number; y: number }>,
  axis: "x" | "y",
): number | null {
  if (Number.isFinite(value)) return value;
  const first = timeline.find((point) => Number.isFinite(point[axis]));
  return first ? first[axis] : null;
}
