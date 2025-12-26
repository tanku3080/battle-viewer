// types/battle.ts

export type TimelinePoint = {
  t: number;
  x: number;
  y: number;
  dir?: number;
};

export type UnitDefinition = {
  id: string;
  force?: string;
  name: string;
  color: string;
  icon: string | null;
};

export type Unit = UnitDefinition & {
  timeline: TimelinePoint[];
  appearAt: number;
  disappearAt: number;
};

export type Character = {
  id: string;
  name: string;
  icon?: string | null;
  timeline: TimelinePoint[];
  appearAt?: number;
  disappearAt?: number;
};

export type HierarchyLevel = "legion" | "corps" | "division" | "regiment";

export type HierarchyNode = {
  id: string;
  level: HierarchyLevel;
  name: string;
  parentId: string | null;
  childrenIds: string[];
  unitIds: string[];
  status: "active" | "destroyed";
  history: Array<{
    t: number;
    event: string;
    detail?: unknown;
  }>;
};

export type CameraKeyframe = {
  t: number;
  x: number;
  y: number;
  zoom: number;
};

export type CameraTarget =
  | { type: "legion"; id: string }
  | { type: "corps"; id: string }
  | { type: "division"; id: string }
  | { type: "regiment"; id: string }
  | { type: "unit"; id: string };

export type BattleTimeline = {
  camera?: CameraKeyframe[];
  units: Record<string, TimelinePoint[]>;
  characters?: Record<string, TimelinePoint[]>;
};

export type BattleMap = {
  width: number;
  height: number;
  image?: string | null;
};

export type BattleData = {
  map: BattleMap;
  units: Unit[];
  characters: Character[];
  hierarchy: {
    nodes: Record<string, HierarchyNode>;
    roots: string[];
  };
  events: BattleEvent[];
  timeline: BattleTimeline;

  unitIndex: Record<string, Unit>;
  characterIndex: Record<string, Character>;
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
      viewOffsetX: number;
      viewOffsetY: number;
      scaleFactor: number;
    }
  | {
      mode: "camera";
      baseScale: number;
      offsetX: number;
      offsetY: number;
      canvasWidth: number;
      canvasHeight: number;
      mapWidth: number;
      mapHeight: number;
      cam: { x: number; y: number; zoom: number };
      viewOffsetX: number;
      viewOffsetY: number;
      scaleFactor: number;
    };

export type DestroyedEvent = {
  t: number;
  event: "destroyed";
  target: string;
};

export type DetachEvent = {
  t: number;
  event: "detach";
  source: string;
  from: string;
};

export type MergeEvent = {
  t: number;
  event: "merge";
  source: string;
  target: string;
};

export type TransferEvent = {
  t: number;
  event: "transfer";
  source: string;
  from: string;
  to: string;
};

export type ReformEvent = {
  t: number;
  event: "reform";
  target: string;
  parent: string | null;
  children?: string[];
};

export type BattleEvent =
  | DestroyedEvent
  | DetachEvent
  | MergeEvent
  | TransferEvent
  | ReformEvent;
