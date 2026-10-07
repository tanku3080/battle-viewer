// types/battle.ts
import type { ForceDefinition } from "@/utils/battle/forces";

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
  destroyAt?: number;
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
  destroyAt?: number;
  timeline: TimelinePoint[];
  appearAt: number;
  disappearAt: number;
};

export type HierarchyLevel = "legion" | "corps" | "division" | "regiment";
export type LodLevel = HierarchyLevel | "unit";

export type GroupMoveKeyframe = { t: number; enabled: boolean };

export type HierarchyNode = {
  id: string;
  level: HierarchyLevel;
  name: string;
  icon?: string | null;
  parentId: string | null;
  childrenIds: string[];
  unitIds: string[];
  status: HierarchyStatus;
  history: Array<{
    t: number;
    event: string;
    detail?: unknown;
  }>;
  pos?: { x: number; y: number };
  groupMove?: boolean;
  groupMoveTimeline?: GroupMoveKeyframe[];
  timeline?: TimelinePoint[];
  appearAt?: number;
  destroyAt?: number;
};

export type LODBand = { min: number; max: number };
export type LODConfig = {
  legion: LODBand;
  corps: LODBand;
  division: LODBand;
  regiment: LODBand;
  unit: LODBand;
  fadeRange: number;
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

export type HierarchyStatus = "active" | "destroyed";

export type StatusEvent = {
  t: number;
  event: "status";
  target: string;
  status: HierarchyStatus;
};

export type ReparentEvent = {
  t: number;
  event: "reparent";
  target: string;
  parent: string | null;
};

export type MergeEvent = {
  t: number;
  event: "merge";
  source: string;
  target: string;
};

export type ReformEvent = {
  t: number;
  event: "reform";
  target: string;
  parent?: string | null;
  children?: string[];
};

export type BattleEvent =
  | StatusEvent
  | ReparentEvent
  | MergeEvent
  | ReformEvent;

export type BattleTimeline = {
  camera?: CameraKeyframe[];
  units: Record<string, TimelinePoint[]>;
  characters?: Record<string, TimelinePoint[]>;
  hierarchy?: Record<string, TimelinePoint[]>;
};

export type CoordinateOrigin = "top-left" | "center";

export type BattleMap = {
  width: number;
  height: number;
  image?: string | null;
  /**
   * JSON上の座標原点。
   * - top-left: 従来互換。左上が (0, 0)
   * - center: マップ中央が (0, 0)
   *
   * 描画内部では従来どおり左上原点へ正規化する。
   */
  coordinateOrigin?: CoordinateOrigin;
};

export type BattleData = {
  title: string;
  forces?: ForceDefinition[];
  map: BattleMap;
  lod: LODConfig;
  camera: CameraKeyframe[];
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
