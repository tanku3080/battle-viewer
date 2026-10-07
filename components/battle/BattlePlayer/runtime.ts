import type {
  BattleData,
  BattleEvent,
  CameraKeyframe,
  CameraTarget,
  HierarchyLevel,
  HierarchyNode,
  TimelinePoint,
  Unit,
} from "@/types/battle";
import { cloneHierarchyNodes } from "@/utils/battle/hierarchy";
import { getSmoothTransform } from "./transform";
import { getSpawnState } from "./spawnEffects";

/* -------------------------------------------------
   型定義
------------------------------------------------- */

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
  icon?: string | null;
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
   ユニット状態
------------------------------------------------- */

function collectUnitStates(
  battle: BattleData,
  currentTime: number,
  fadeDuration: number
) {
  const unitStates: UnitRenderState[] = [];
  const unitMap: Record<string, UnitRenderState> = {};

  battle.units.forEach((unit) => {
    const transform = getSmoothTransform(unit.timeline, currentTime);
    const destroyed =
      unit.destroyAt !== undefined && currentTime >= unit.destroyAt;
    const { visible, alpha, scale } = getSpawnState(
      currentTime,
      unit.appearAt,
      unit.disappearAt,
      fadeDuration
    );

    const state: UnitRenderState = {
      unit,
      transform,
      visible: visible && !destroyed,
      alpha: destroyed ? 0 : alpha,
      scale: destroyed ? 0 : scale,
    };

    unitStates.push(state);
    unitMap[unit.id] = state;
  });

  return { unitStates, unitMap };
}

/* -------------------------------------------------
   キャラ状態
------------------------------------------------- */

function collectCharacterStates(
  battle: BattleData,
  currentTime: number,
  fadeDuration: number
) {
  const result: CharacterRenderState[] = [];

  (battle.characters ?? []).forEach((ch) => {
    const transform = getSmoothTransform(ch.timeline ?? [], currentTime);

    const appearAt = ch.appearAt ?? 0;
    const disappearAt = ch.disappearAt ?? Number.POSITIVE_INFINITY;

    const destroyed =
      ch.destroyAt !== undefined && currentTime >= ch.destroyAt;
    const { visible, alpha, scale } = getSpawnState(
      currentTime,
      appearAt,
      disappearAt,
      fadeDuration
    );

    result.push({
      id: ch.id,
      name: ch.name,
      icon: ch.icon ?? null,
      transform,
      visible: visible && !destroyed,
      alpha: destroyed ? 0 : alpha,
      scale: destroyed ? 0 : scale,
    });
  });

  return result;
}

/* -------------------------------------------------
   ヒエラルキー更新
------------------------------------------------- */

function removeChild(parent: HierarchyNode, childId: string) {
  parent.childrenIds = parent.childrenIds.filter((id) => id !== childId);
}

function addChild(parent: HierarchyNode, childId: string) {
  if (!parent.childrenIds.includes(childId)) parent.childrenIds.push(childId);
}

function applyEventsToHierarchy(
  baseNodes: Record<string, HierarchyNode>,
  events: BattleEvent[],
  currentTime: number
) {
  const nodes = Object.fromEntries(
    Object.entries(cloneHierarchyNodes(baseNodes)).filter(([, node]) => {
      const appearAt = node.appearAt ?? 0;
      const beforeAppearance = currentTime < appearAt;
      const destroyed =
        node.destroyAt !== undefined && currentTime >= node.destroyAt;
      return !beforeAppearance && !destroyed;
    })
  );

  const relevant = events
    .filter((event) => event.t <= currentTime)
    .sort((a, b) => a.t - b.t);

  for (const event of relevant) {
    if (event.event === "status") {
      const target = nodes[event.target];
      if (!target) continue;

      target.status = event.status;
      target.history.push({
        t: event.t,
        event: event.event,
        detail: { status: event.status },
      });
      continue;
    }

    if (event.event === "reparent") {
      const target = nodes[event.target];
      if (!target) continue;

      if (target.parentId && nodes[target.parentId]) {
        removeChild(nodes[target.parentId], target.id);
      }

      target.parentId = event.parent;
      if (event.parent && nodes[event.parent]) {
        addChild(nodes[event.parent], target.id);
      }

      target.history.push({
        t: event.t,
        event: event.event,
        detail: { parent: event.parent },
      });
      continue;
    }

    if (event.event === "merge") {
      const source = nodes[event.source];
      const target = nodes[event.target];
      if (
        !source ||
        !target ||
        source.id === target.id ||
        source.level !== target.level
      ) {
        continue;
      }

      if (source.parentId && nodes[source.parentId]) {
        removeChild(nodes[source.parentId], source.id);
      }

      // source配下をtargetへ吸収する。
      source.childrenIds.forEach((childId) => {
        const child = nodes[childId];
        if (child) child.parentId = target.id;
        addChild(target, childId);
      });
      source.unitIds.forEach((unitId) => {
        if (!target.unitIds.includes(unitId)) target.unitIds.push(unitId);
      });

      target.status = "active";
      target.history.push({
        t: event.t,
        event: event.event,
        detail: { source: source.id },
      });

      // 統合元ノードは画面から消し、targetだけを残す。
      delete nodes[source.id];
      continue;
    }

    if (event.event === "reform") {
      const target = nodes[event.target];
      if (!target) continue;

      if (event.parent !== undefined) {
        if (target.parentId && nodes[target.parentId]) {
          removeChild(nodes[target.parentId], target.id);
        }
        target.parentId = event.parent;
        if (event.parent && nodes[event.parent]) {
          addChild(nodes[event.parent], target.id);
        }
      }

      if (event.children) {
        if (target.level === "regiment") {
          target.unitIds = [...event.children];
        } else {
          target.childrenIds = [...event.children];
          event.children.forEach((childId) => {
            if (nodes[childId]) nodes[childId].parentId = target.id;
          });
        }
      }

      target.status = "active";
      target.history.push({
        t: event.t,
        event: event.event,
        detail: { parent: event.parent, children: event.children },
      });
    }
  }

  return nodes;
}

/* -------------------------------------------------
   位置推定（子の平均座標）
------------------------------------------------- */

function computeHierarchyPositions(
  nodes: Record<string, HierarchyNode>,
  unitStates: Record<string, UnitRenderState>
): {
  positioned: Record<string, NodeWithPosition>;
  levels: Record<HierarchyLevel, string[]>;
  roots: string[];
} {
  const positioned: Record<string, NodeWithPosition> = {};
  const levels: Record<HierarchyLevel, string[]> = {
    legion: [],
    corps: [],
    division: [],
    regiment: [],
  };

  const cache = new Map<string, { x: number; y: number } | null>();

  const getPosition = (nodeId: string): { x: number; y: number } | null => {
    if (cache.has(nodeId)) return cache.get(nodeId) ?? null;

    const node = nodes[nodeId];
    if (!node) return null;

    if (node.pos) {
      const fixed = { ...node.pos };
      cache.set(node.id, fixed);
      return fixed;
    }

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
        { x: 0, y: 0 }
      );
      position = { x: sum.x / points.length, y: sum.y / points.length };
    }

    cache.set(node.id, position);
    return position;
  };

  // ルート抽出
  const roots = Object.values(nodes)
    .filter((n) => !n.parentId)
    .map((n) => n.id);

  // positioned 作成
  for (const n of Object.values(nodes)) {
    const pos = getPosition(n.id);
    positioned[n.id] = { ...n, position: pos };
    levels[n.level].push(n.id);
  }

  return { positioned, levels, roots };
}

/* -------------------------------------------------
   LOD フィルタ（ユニット集合）
------------------------------------------------- */

function computeActiveUnitIds(
  hierarchy: Record<string, NodeWithPosition>,
  selectedTarget: CameraTarget | null
) {
  const active = new Set<string>();

  if (!selectedTarget) return active;

  if (selectedTarget.type === "unit") {
    active.add(selectedTarget.id);
    return active;
  }

  const root = hierarchy[selectedTarget.id];
  if (!root) return active;

  const dfs = (id: string) => {
    const node = hierarchy[id];
    if (!node) return;
    if (node.level === "regiment") {
      node.unitIds.forEach((uid) => active.add(uid));
      return;
    }
    node.childrenIds.forEach((cid) => dfs(cid));
  };

  dfs(root.id);
  return active;
}

/* -------------------------------------------------
   FrameState 生成（描画/クリック共通）
------------------------------------------------- */

export function prepareFrameState(
  battle: BattleData,
  currentTime: number,
  fadeDuration: number,
  cameraTarget: CameraTarget | null = null
): FrameState {
  const { unitStates, unitMap } = collectUnitStates(
    battle,
    currentTime,
    fadeDuration
  );

  const characters = collectCharacterStates(battle, currentTime, fadeDuration);

  // ===== ここが防御ポイント =====
  const hierarchyData = battle.hierarchy ?? {
    nodes: {},
    roots: [],
  };

  const events = battle.events ?? [];
  // ============================

  const nodes = applyEventsToHierarchy(
    hierarchyData.nodes,
    events,
    currentTime
  );

  const { positioned, levels, roots } = computeHierarchyPositions(
    nodes,
    unitMap
  );

  const activeUnitIds = computeActiveUnitIds(positioned, cameraTarget);

  return {
    units: unitStates,
    unitMap,
    characters,
    hierarchy: {
      nodes: positioned,
      roots,
      levels,
      activeUnitIds,
    },
  };
}

/* -------------------------------------------------
   注視カメラ（仕様化）
------------------------------------------------- */

export const CAMERA_FOLLOW_RATE = 0.2;

export const CAMERA_ZOOM_PRESET: Record<HierarchyLevel | "unit", number> = {
  legion: 0.2,
  corps: 0.3,
  division: 0.5,
  regiment: 1.0,
  unit: 2.5,
};

function ensureCameraCache(battle: BattleData) {
  if (!cameraCache.has(battle)) cameraCache.set(battle, null);
  return cameraCache.get(battle);
}

const cameraCache = new WeakMap<BattleData, CameraKeyframe | null>();

export function focusCameraOn(
  battle: BattleData,
  frame: FrameState,
  baseCam: CameraKeyframe,
  target: CameraTarget | null
) {
  const safeBase: CameraKeyframe = {
    t: baseCam.t ?? 0,
    x: baseCam.x ?? battle.map.width / 2,
    y: baseCam.y ?? battle.map.height / 2,
    zoom: baseCam.zoom ?? 1,
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

  const zoomPreset = CAMERA_ZOOM_PRESET;

  const prev = ensureCameraCache(battle) ?? safeBase;
  const lerp = (a: number, b: number, r: number) => a + (b - a) * r;

  const nextCam: CameraKeyframe = {
    t: safeBase.t,
    x: lerp(prev.x, pos.x, CAMERA_FOLLOW_RATE),
    y: lerp(prev.y, pos.y, CAMERA_FOLLOW_RATE),
    zoom: lerp(prev.zoom, zoomPreset[target.type], CAMERA_FOLLOW_RATE),
  };

  cameraCache.set(battle, nextCam);
  return nextCam;
}
