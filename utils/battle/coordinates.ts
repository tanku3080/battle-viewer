export type CoordinateOriginLike = "top-left" | "center";

export type CoordinateMapLike = {
  width: number;
  height: number;
  coordinateOrigin?: CoordinateOriginLike;
};

export type CoordinatePointLike = {
  x: number;
  y: number;
};

export function validateCoordinateMap(map: CoordinateMapLike | undefined) {
  if (!map) throw new Error("map is required");
  if (!Number.isFinite(map.width) || map.width <= 0) {
    throw new Error("map.width must be a number greater than 0");
  }
  if (!Number.isFinite(map.height) || map.height <= 0) {
    throw new Error("map.height must be a number greater than 0");
  }
  if (
    map.coordinateOrigin !== undefined &&
    map.coordinateOrigin !== "top-left" &&
    map.coordinateOrigin !== "center"
  ) {
    throw new Error(
      'map.coordinateOrigin must be "top-left" or "center"'
    );
  }
}

export function getCoordinateOrigin(
  map: CoordinateMapLike
): CoordinateOriginLike {
  return map.coordinateOrigin ?? "top-left";
}

export function toInternalPoint<T extends CoordinatePointLike>(
  point: T,
  map: CoordinateMapLike
): T {
  if (getCoordinateOrigin(map) !== "center") return point;

  return {
    ...point,
    x: point.x + map.width / 2,
    y: map.height / 2 - point.y,
  };
}

export function toInternalPosition(
  position: CoordinatePointLike | undefined,
  map: CoordinateMapLike
) {
  if (!position || getCoordinateOrigin(map) !== "center") return position;

  return {
    x: position.x + map.width / 2,
    y: map.height / 2 - position.y,
  };
}
