// types/battle.ts

export type RenderTransform =
  | {
      mode: "map";
      baseScale: number;
      offsetX: number;
      offsetY: number;
      canvasWidth: number;
      canvasHeight: number;
      mapWidth: number;
      mapHeight: number;
      viewOffsetX: number; // ← 追加
      viewOffsetY: number; // ← 追加
      scaleFactor: number;
    }
  | {
      mode: "camera";
      baseScale: number;
      canvasWidth: number;
      canvasHeight: number;
      mapWidth: number;
      mapHeight: number;
      cam: { x: number; y: number; zoom: number };
      viewOffsetX: number; // ← 追加
      viewOffsetY: number; // ← 追加
      scaleFactor: number;
    };
