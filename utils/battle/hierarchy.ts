import type {
  BattleEvent,
  HierarchyLevel,
  HierarchyNode,
  Unit,
} from "./battle";

export type HierarchySourceNode = {
  id: string;
  name?: string;
  pos?: { x: number; y: number }; // ★追加
  children?: HierarchySourceNode[];
  units?: string[];
};

const LEVEL_ORDER: HierarchyLevel[] = [
  "legion",
  "corps",
  "division",
  "regiment",
];

export function cloneHierarchyNodes(
  nodes: Record<string, HierarchyNode>
): Record<string, HierarchyNode> {
  const cloned: Record<string, HierarchyNode> = {};
  Object.values(nodes).forEach((n) => {
    cloned[n.id] = {
      ...n,
      childrenIds: [...n.childrenIds],
      unitIds: [...n.unitIds],
      history: [...n.history],
    };
  });
  return cloned;
}

export function buildHierarchyNodesFromJson(
  hierarchy: { legions?: HierarchySourceNode[] } | undefined,
  unitIndex: Record<string, Unit>
) {
  const nodes: Record<string, HierarchyNode> = {};
  const roots: string[] = [];

  const walk = (
    src: HierarchySourceNode,
    parentId: string | null,
    levelIndex: number
  ) => {
    const level = LEVEL_ORDER[Math.min(levelIndex, LEVEL_ORDER.length - 1)];
    const unitIds = (src.units ?? []).filter((id) => !!unitIndex[id]);

    const node: HierarchyNode = {
      id: src.id,
      name: src.name ?? src.id,
      level,
      parentId,
      childrenIds: [],
      unitIds,
      status: "active",
      history: [],
      pos: src.pos ?? undefined,
    };

    nodes[node.id] = node;
    if (!parentId) roots.push(node.id);

    const nextLevel = Math.min(levelIndex + 1, LEVEL_ORDER.length - 1);
    (src.children ?? []).forEach((child) => {
      node.childrenIds.push(child.id);
      walk(child, node.id, nextLevel);
    });
  };

  hierarchy?.legions?.forEach((legion) => walk(legion, null, 0));

  return { nodes, roots };
}

export function sortEvents(events: BattleEvent[]) {
  return [...events].sort((a, b) => a.t - b.t);
}
