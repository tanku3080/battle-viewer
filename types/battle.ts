// types/battle.ts

export type TimelinePoint = {
  t: number;
  x: number;
  y: number;
};

export type CameraKeyframe = {
  t: number;
  x: number;
  y: number;
  zoom: number;
};

export type Unit = {
  id: string;
  force: string;
  name: string;
  color: string;
  icon?: string | null;
  timeline: TimelinePoint[];
};

export type Character = {
  id: string;
  name: string;
  icon: string;
  timeline: TimelinePoint[];
};

export type BattleData = {
  title: string;
  map: {
    image: string;
    width: number;
    height: number;
  };
  camera?: CameraKeyframe[];
  units: Unit[];
  characters?: Character[];
};
