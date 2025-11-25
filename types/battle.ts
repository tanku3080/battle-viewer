// types/battle.ts

export type TimelinePoint = {
  t: number;
  x: number;
  y: number;
  dir?: number; // 方向（ラジアン）※旧JSON互換のため optional
};

export type Unit = {
  id: string;
  force: string;
  name: string;
  color: string;
  icon: string | null;
  timeline: TimelinePoint[];
};

export type Character = {
  id: string;
  name: string;
  icon: string;
  timeline: TimelinePoint[];
};

export type CameraKeyframe = {
  t: number;
  x: number;
  y: number;
  zoom: number;
};

export type BattleData = {
  title: string;
  map: {
    image: string;
    width: number;
    height: number;
  };
  camera: CameraKeyframe[];
  units: Unit[];
  characters?: Character[];
};

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
    }
  | {
      mode: "camera";
      baseScale: number;
      canvasWidth: number;
      canvasHeight: number;
      mapWidth: number;
      mapHeight: number;
      cam: { x: number; y: number; zoom: number };
    };
