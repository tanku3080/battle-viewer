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
  if (!map) throw new Error("map がありません");
  if (!Number.isFinite(map.width) || map.width <= 0) {
    throw new Error("map.width は 0 より大きい数値である必要があります");
  }
  if (!Number.isFinite(map.height) || map.height <= 0) {
    throw new Error("map.height は 0 より大きい数値である必要があります");
  }
  if (
    map.coordinateOrigin !== undefined &&
    map.coordinateOrigin !== "top-left" &&
    map.coordinateOrigin !== "center"
  ) {
    throw new Error(
      'map.coordinateOrigin は "top-left" または "center" を指定してください'
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
