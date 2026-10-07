export type CreatorTimelinePoint = {
  t: number;
  x: number;
  y: number;
  dir?: number;
  zoom?: number;
};

export function getCreatorPositionAt(
  timeline: CreatorTimelinePoint[],
  t: number,
  fallback: { x: number; y: number }
) {
  if (timeline.length === 0) return fallback;

  const points = [...timeline].sort((a, b) => a.t - b.t);
  if (t <= points[0].t) return { x: points[0].x, y: points[0].y };

  const last = points[points.length - 1];
  if (t >= last.t) return { x: last.x, y: last.y };

  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (t < a.t || t > b.t) continue;

    const span = b.t - a.t;
    if (span <= 0) return { x: b.x, y: b.y };

    const ratio = (t - a.t) / span;
    return {
      x: a.x + (b.x - a.x) * ratio,
      y: a.y + (b.y - a.y) * ratio,
    };
  }

  return fallback;
}

export function getCreatorElementVisualState(args: {
  timeline: CreatorTimelinePoint[];
  appearAt: number;
  destroyEnabled: boolean;
  destroyAt: number;
  t: number;
  fadeDuration: number;
  animateTransitions?: boolean;
}) {
  const {
    timeline,
    appearAt,
    destroyEnabled,
    destroyAt,
    t,
    fadeDuration,
    animateTransitions = true,
  } = args;

  const spawnAt = timeline.length > 0
    ? Math.min(...timeline.map((point) => point.t))
    : appearAt;

  if (!Number.isFinite(spawnAt) || t < spawnAt) {
    return { visible: false, alpha: 0, scale: 0 };
  }

  if (!animateTransitions) {
    const destroyed =
      destroyEnabled &&
      Number.isFinite(destroyAt) &&
      t > destroyAt;

    return destroyed
      ? { visible: false, alpha: 0, scale: 0 }
      : { visible: true, alpha: 1, scale: 1 };
  }

  if (t < spawnAt + fadeDuration) {
    const ratio = Math.max(
      0,
      Math.min(1, (t - spawnAt) / fadeDuration)
    );
    return {
      visible: true,
      alpha: ratio,
      scale: 0.2 + 0.8 * ratio,
    };
  }

  if (
    destroyEnabled &&
    Number.isFinite(destroyAt) &&
    t > destroyAt
  ) {
    const ratio = 1 - (t - destroyAt) / fadeDuration;
    if (ratio <= 0) {
      return { visible: false, alpha: 0, scale: 0 };
    }
    return {
      visible: true,
      alpha: ratio,
      scale: 0.2 + 0.8 * ratio,
    };
  }

  return { visible: true, alpha: 1, scale: 1 };
}

export function isCreatorElementVisibleAt(args: {
  timeline: CreatorTimelinePoint[];
  appearAt: number;
  destroyEnabled: boolean;
  destroyAt: number;
  t: number;
  animateTransitions?: boolean;
}) {
  return getCreatorElementVisualState({
    ...args,
    fadeDuration: 0.5,
  }).visible;
}


export function getCreatorCameraAt(
  timeline: CreatorTimelinePoint[],
  t: number,
  fallback: { x: number; y: number; zoom: number }
) {
  if (timeline.length === 0) return fallback;

  const points = [...timeline].sort((a, b) => a.t - b.t);
  const toCamera = (point: CreatorTimelinePoint) => ({
    x: point.x,
    y: point.y,
    zoom:
      typeof point.zoom === "number" && Number.isFinite(point.zoom)
        ? point.zoom
        : fallback.zoom,
  });

  if (t <= points[0].t) return toCamera(points[0]);

  const last = points[points.length - 1];
  if (t >= last.t) return toCamera(last);

  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (t < a.t || t > b.t) continue;

    const span = b.t - a.t;
    if (span <= 0) return toCamera(b);

    const ratio = (t - a.t) / span;
    const az =
      typeof a.zoom === "number" && Number.isFinite(a.zoom)
        ? a.zoom
        : fallback.zoom;
    const bz =
      typeof b.zoom === "number" && Number.isFinite(b.zoom)
        ? b.zoom
        : az;

    return {
      x: a.x + (b.x - a.x) * ratio,
      y: a.y + (b.y - a.y) * ratio,
      zoom: az + (bz - az) * ratio,
    };
  }

  return fallback;
}
