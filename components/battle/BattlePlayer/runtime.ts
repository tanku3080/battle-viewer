import type {
  BattleData,
  BattleEvent,
  CameraKeyframe,
  CameraTarget,
  HierarchyLevel,
  HierarchyNode,
  TimelinePoint,
  Unit,
} from "@/utils/battle/battle";
import { cloneHierarchyNodes } from "@/utils/battle/hierarchy";
import { getSmoothTransform } from "./transform";
import { getSpawnState } from "./spawnEffects";

/* -------------------------------------------------
   型定義
---------------------------------------------------*/

export type UnitRenderState = {
  unit: Unit;
  transform: TimelinePoint | null;
  visible: boolean;
  alpha: number;
  scale: number;
};

export type CharacterRenderState = {
  id: string;
  name: string;
  icon: string;
  transform: TimelinePoint | null;
  visible: boolean;
  alpha: number;
  scale: number;
};

export type NodeWithPosition = HierarchyNode & {
  position: { x: number; y: number } | null;
};

export type FrameHierarchyState = {
  nodes: Record<string, NodeWithPosition>;
  roots: string[];
  levels: Record<HierarchyLevel, string[]>;
  activeUnitIds: Set<string>;
};

export type FrameState = {
  units: UnitRenderState[];
  unitMap: Record<string, UnitRenderState>;
  characters: CharacterRenderState[];
  hierarchy: FrameHierarchyState;
};

/* -------------------------------------------------
   キャッシュ（位置 / カメラ）
---------------------------------------------------*/

type PositionCache = Map<string, { x: number; y: number }>;

const positionCache = new WeakMap<BattleData, PositionCache>();
const cameraCache = new WeakMap<BattleData, CameraKeyframe>();

function ensurePositionCache(battle: BattleData): PositionCache {
  if (!positionCache.has(battle)) {
    positionCache.set(battle, new Map());
  }
  return positionCache.get(battle)!;
}

function ensureCameraCache(battle: BattleData): CameraKeyframe | null {
  return cameraCache.get(battle) ?? null;
}

/* -------------------------------------------------
   ユニット・キャラのフレーム状態収集
---------------------------------------------------*/

function collectUnitStates(
  battle: BattleData,
  currentTime: number,
  fadeDuration: number
) {
  const unitStates: UnitRenderState[] = [];
  const unitMap: Record<string, UnitRenderState> = {};

  battle.units.forEach((unit) => {
    const transform = getSmoothTransform(unit.timeline, currentTime);
    const { visible, alpha, scale } = getSpawnState(
      currentTime,
      unit.appearAt,
      unit.disappearAt,
      fadeDuration
    );

    const state: UnitRenderState = {
      unit,
      transform,
      visible,
      alpha,
      scale,
    };

    unitStates.push(state);
    unitMap[unit.id] = state;
  });

  return { unitStates, unitMap };
}

function collectCharacterStates(
  battle: BattleData,
  currentTime: number,
  fadeDuration: number
): CharacterRenderState[] {
  return (
    battle.characters?.map((ch) => {
      const transform = getSmoothTransform(ch.timeline, currentTime);
      const { visible, alpha, scale } = getSpawnState(
        currentTime,
        ch.appearAt,
        ch.disappearAt,
        fadeDuration
      );

      return {
        id: ch.id,
        name: ch.name,
        icon: ch.icon,
        transform,
        visible,
        alpha,
        scale,
      };
    }) ?? []
  );
}

/* -------------------------------------------------
   イベント適用
---------------------------------------------------*/

function removeChild(parent: HierarchyNode | undefined, childId: string) {
  if (!parent) return;
  parent.childrenIds = parent.childrenIds.filter((id) => id !== childId);
}

function addChild(parent: HierarchyNode | undefined, childId: string) {
  if (!parent) return;
  if (!parent.childrenIds.includes(childId)) {
    parent.childrenIds.push(childId);
  }
}

function applyEvents(
  nodes: Record<string, HierarchyNode>,
  events: BattleEvent[],
  t: number
) {
  events.forEach((ev) => {
    if (ev.t > t) return;

    if (ev.event === "destroyed") {
      const node = nodes[ev.legion];
      if (!node) return;
      node.status = "destroyed";
      node.unitIds = [];
      node.history.push({
        t: ev.t,
        event: ev.event,
        detail: { legion: ev.legion },
      });
      return;
    }

    if (ev.event === "detach") {
      const source = nodes[ev.source];
      const from = nodes[ev.from];
      if (!source) return;
      removeChild(from, source.id);
      if (source.parentId) removeChild(nodes[source.parentId], source.id);
      source.parentId = null;
      source.history.push({
        t: ev.t,
        event: ev.event,
        detail: { from: ev.from },
      });
      return;
    }

    if (ev.event === "merge") {
      const source = nodes[ev.source];
      const target = nodes[ev.target];
      if (!source || !target) return;
      if (source.parentId) removeChild(nodes[source.parentId], source.id);
      source.parentId = target.id;
      addChild(target, source.id);
      source.status = "active";
      source.history.push({
        t: ev.t,
        event: ev.event,
        detail: { target: ev.target },
      });
      return;
    }

    if (ev.event === "transfer") {
      const source = nodes[ev.source];
      const from = nodes[ev.from];
      const to = nodes[ev.to];
      if (!source || !to) return;
      removeChild(from, source.id);
      if (source.parentId) removeChild(nodes[source.parentId], source.id);
      source.parentId = to.id;
      addChild(to, source.id);
      source.history.push({
        t: ev.t,
        event: ev.event,
        detail: { from: ev.from, to: ev.to },
      });
      return;
    }

    if (ev.event === "reform") {
      const node = nodes[ev.legion];
      if (!node) return;
      ev.units.forEach((id) => {
        if (!node.unitIds.includes(id)) node.unitIds.push(id);
      });
      node.status = "active";
      node.history.push({
        t: ev.t,
        event: ev.event,
        detail: { units: ev.units.length },
      });
    }
  });
}

/* -------------------------------------------------
   階層位置計算
---------------------------------------------------*/

function recomputeRoots(nodes: Record<string, HierarchyNode>) {
  const roots: string[] = [];
  Object.values(nodes).forEach((node) => {
    if (!node.parentId || !nodes[node.parentId]) roots.push(node.id);
  });
  return roots;
}

function computeHierarchyPositions(
  battle: BattleData,
  nodes: Record<string, HierarchyNode>,
  unitStates: Record<string, UnitRenderState>
): FrameHierarchyState {
  const cache = ensurePositionCache(battle);
  const positioned: Record<string, NodeWithPosition> = {};
  const levels = {
    legion: [],
    corps: [],
    division: [],
    regiment: [],
  } as Record<HierarchyLevel, string[]>;
  const activeUnitIds = new Set<string>();

  const getPosition = (nodeId: string): { x: number; y: number } | null => {
    if (positioned[nodeId]) return positioned[nodeId].position;

    const node = nodes[nodeId];
    if (!node) return null;

    let points: { x: number; y: number }[] = [];
    if (node.level === "regiment") {
      points = node.unitIds
        .map((id) => unitStates[id])
        .filter((u) => u && u.visible && u.transform)
        .map((u) => ({ x: u.transform!.x, y: u.transform!.y }));
    } else {
      points = node.childrenIds
        .map((childId) => getPosition(childId))
        .filter((p): p is { x: number; y: number } => !!p);
    }

    let position: { x: number; y: number } | null = null;

    if (points.length > 0) {
      const sum = points.reduce(
        (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
        {
          x: 0,
          y: 0,
        }
      );
      position = { x: sum.x / points.length, y: sum.y / points.length };
      cache.set(node.id, position);
    } else {
      position = cache.get(node.id) ?? null;
    }

    positioned[node.id] = { ...node, position };
    levels[node.level].push(node.id);
    node.unitIds.forEach((uid: string) => activeUnitIds.add(uid));

    return position;
  };

  const roots = recomputeRoots(nodes);
  roots.forEach((rootId) => getPosition(rootId));

  return { nodes: positioned, roots, levels, activeUnitIds };
}

/* -------------------------------------------------
   フレーム構築
---------------------------------------------------*/

export function prepareFrameState(
  battle: BattleData,
  currentTime: number,
  fadeDuration: number
): FrameState {
  const { unitStates, unitMap } = collectUnitStates(
    battle,
    currentTime,
    fadeDuration
  );
  const characters = collectCharacterStates(battle, currentTime, fadeDuration);

  const baseNodes = battle.hierarchyNodes ?? {};
  const clonedNodes = cloneHierarchyNodes(baseNodes);
  applyEvents(clonedNodes, battle.events ?? [], currentTime);

  const hierarchy = computeHierarchyPositions(battle, clonedNodes, unitMap);

  return {
    units: unitStates,
    unitMap,
    characters,
    hierarchy,
  };
}

/* -------------------------------------------------
   カメラ注視
---------------------------------------------------*/

export function focusCameraOn(
  battle: BattleData,
  frame: FrameState,
  baseCam: CameraKeyframe,
  target: CameraTarget | null | undefined
): CameraKeyframe {
  // CameraKeyframe に正規化
  const safeBase: CameraKeyframe = {
    t: baseCam.t ?? 0,
    x: baseCam.x,
    y: baseCam.y,
    zoom: baseCam.zoom,
  };

  if (!target) return safeBase;

  let pos: { x: number; y: number } | null = null;

  if (target.type === "unit") {
    const u = frame.unitMap[target.id];
    pos = u?.transform ? { x: u.transform.x, y: u.transform.y } : null;
  } else {
    pos = frame.hierarchy.nodes[target.id]?.position ?? null;
  }

  if (!pos) return safeBase;

  const zoomPreset: Record<HierarchyLevel | "unit", number> = {
    legion: 0.2,
    corps: 0.3,
    division: 0.5,
    regiment: 1.0,
    unit: 2.5,
  };

  const prev = ensureCameraCache(battle) ?? safeBase;
  const lerp = (a: number, b: number, r: number) => a + (b - a) * r;

  const nextCam: CameraKeyframe = {
    t: safeBase.t,
    x: lerp(prev.x, pos.x, 0.2),
    y: lerp(prev.y, pos.y, 0.2),
    zoom: lerp(prev.zoom, zoomPreset[target.type], 0.2),
  };

  cameraCache.set(battle, nextCam);
  return nextCam;
}
