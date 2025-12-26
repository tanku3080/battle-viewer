import type {
  CameraKeyframe,
  CameraTarget,
  HierarchyLevel,
  HierarchyNode,
  TimelinePoint,
  Unit,
} from "@/utils/battle/battle";
import type { BattleEvent, BattleData } from "@/types/battle";
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
      visible,
      alpha,
      scale,
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
  const nodes = cloneHierarchyNodes(baseNodes);

  const relevant = events
    .filter((e) => e.t <= currentTime)
    .sort((a, b) => a.t - b.t);

  for (const ev of relevant) {
    if (ev.event === "destroyed") {
      const target = nodes[ev.target];
      if (!target) continue;
      target.status = "destroyed";
      target.history.push({ t: ev.t, event: ev.event });
      continue;
    }

    if (ev.event === "detach") {
      const source = nodes[ev.source];
      if (!source) continue;
      if (source.parentId) removeChild(nodes[source.parentId], source.id);
      source.parentId = null;
      source.history.push({
        t: ev.t,
        event: ev.event,
        detail: { from: ev.from },
      });
      continue;
    }

    if (ev.event === "merge") {
      const source = nodes[ev.source];
      const target = nodes[ev.target];
      if (!source || !target) continue;
      if (source.parentId) removeChild(nodes[source.parentId], source.id);
      source.parentId = target.id;
      addChild(target, source.id);
      source.status = "active";
      source.history.push({
        t: ev.t,
        event: ev.event,
        detail: { target: ev.target },
      });
      continue;
    }

    if (ev.event === "transfer") {
      const source = nodes[ev.source];
      const to = nodes[ev.to];
      if (!source || !to) continue;
      if (source.parentId) removeChild(nodes[source.parentId], source.id);
      source.parentId = to.id;
      addChild(to, source.id);
      source.status = "active";
      source.history.push({
        t: ev.t,
        event: ev.event,
        detail: { from: ev.from, to: ev.to },
      });
      continue;
    }

    if (ev.event === "reform") {
      const target = nodes[ev.target];
      if (!target) continue;

      // parent の付け替え
      if (target.parentId) removeChild(nodes[target.parentId], target.id);
      target.parentId = ev.parent ?? null;
      if (ev.parent && nodes[ev.parent]) addChild(nodes[ev.parent], target.id);

      // children の上書き（指定がある場合）
      if (ev.children) {
        target.childrenIds = [...ev.children];
        // 子側の parentId も合わせる
        ev.children.forEach((cid) => {
          if (nodes[cid]) nodes[cid].parentId = target.id;
        });
      }

      target.status = "active";
      target.history.push({
        t: ev.t,
        event: ev.event,
        detail: { parent: ev.parent, children: ev.children },
      });
      continue;
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
