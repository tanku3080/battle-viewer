// utils/battle/battle.ts

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

// LODConfig（loadBattleJson.ts が参照してるやつ）
export type LODBand = { min: number; max: number };
export type LODConfig = {
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

export type BattleEvent =
  | {
      t: number;
      event: "destroyed";
      target: string;
    }
  | {
      t: number;
      event: "detach";
      source: string;
      from: string;
    }
  | {
      t: number;
      event: "merge";
      source: string;
      target: string;
    }
  | {
      t: number;
      event: "transfer";
      source: string;
      from: string;
      to: string;
    }
  | {
      t: number;
      event: "reform";
      target: string;
      parent: string | null;
      children?: string[];
    };

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

// ※ 今のloadBattleJson.tsのreturn形に合わせる（実装に存在するフィールド）
export type BattleData = {
  title: string;
  meta?: { title?: string; duration?: number };
  map: BattleMap;

  lod: LODConfig;

  // 互換用（既存実装が参照してる想定）
  camera: CameraKeyframe[];

  units: Unit[];
  characters: Character[];
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
