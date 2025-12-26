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
  icon: string;
  timeline: TimelinePoint[];
  appearAt: number;
  disappearAt: number;
};

export type CameraKeyframe = {
  t: number;
  x: number;
  y: number;
  zoom: number;
};

export type LODRange = { min: number; max: number };
export type LODConfig = {
  corps: LODRange;
  division: LODRange;
  regiment: LODRange;
  unit: LODRange;
  fadeRange: number;
};

export type HierarchyLevel = "legion" | "corps" | "division" | "regiment";

export type HierarchyNodeStatus = "active" | "destroyed" | "merged";

export type HierarchyHistory = {
  t: number;
  event: string;
  detail?: Record<string, string | number | null | undefined>;
};

export type HierarchyNode = {
  id: string;
  name: string;
  level: HierarchyLevel;
  parentId: string | null;
  childrenIds: string[];
  unitIds: string[];
  status: HierarchyNodeStatus;
  history: HierarchyHistory[];
  pos: unknown;
};

export type DestroyedEvent = {
  t: number;
  event: "destroyed";
  legion: string;
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
  legion: string;
  units: string[];
};

export type BattleEvent =
  | DestroyedEvent
  | DetachEvent
  | MergeEvent
  | TransferEvent
  | ReformEvent;

export type BattleTimeline = {
  camera?: CameraKeyframe[];
  units: Record<string, TimelinePoint[]>;
  characters?: Record<string, TimelinePoint[]>;
};

export type CameraTarget = {
  type: HierarchyLevel | "unit";
  id: string;
};

export type BattleData = {
  title: string;
  meta?: {
    title?: string;
    duration?: number;
  };
  cameraTarget?: CameraTarget | null;
  map: {
    image: string;
    width: number;
    height: number;
  };
  lod: LODConfig;
  camera: CameraKeyframe[];
  units: Unit[];
  characters?: Character[];
  events: BattleEvent[];
  timeline: BattleTimeline;
  hierarchyNodes: Record<string, HierarchyNode>;
  hierarchyRoots: string[];
  unitIndex: Record<string, Unit>;
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
      canvasWidth: number;
      canvasHeight: number;
      mapWidth: number;
      mapHeight: number;
      cam: { x: number; y: number; zoom: number };
      viewOffsetX: number;
      viewOffsetY: number;
      scaleFactor: number;
    };
