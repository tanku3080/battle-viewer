import type {
  BattleEvent,
  HierarchyLevel,
  HierarchyNode,
  Unit,
  TimelinePoint,
  GroupMoveKeyframe,
} from "@/types/battle";

export type HierarchySourceNode = {
  id: string;
  name?: string;
  description?: string;
  icon?: string | null;
  pos?: { x: number; y: number };
  groupMove?: boolean;
  groupMoveTimeline?: GroupMoveKeyframe[];
  timeline?: TimelinePoint[];
  appearAt?: number;
  destroyAt?: number;
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
  return Object.fromEntries(
    Object.values(nodes).map((node) => [
      node.id,
      {
        ...node,
        childrenIds: [...node.childrenIds],
        unitIds: [...node.unitIds],
        history: [...node.history],
        pos: node.pos ? { ...node.pos } : undefined,
        timeline: node.timeline?.map((point) => ({ ...point })),
        groupMoveTimeline: node.groupMoveTimeline?.map((point) => ({ ...point })),
      },
    ])
  );
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
    const node: HierarchyNode = {
      id: src.id,
      name: src.name ?? src.id,
      description: typeof src.description === "string" ? src.description : undefined,
      icon: src.icon ?? null,
      level,
      parentId,
      childrenIds: [],
      unitIds: (src.units ?? []).filter((id) => !!unitIndex[id]),
      status: "active",
      history: [],
      pos: src.pos,
      groupMove: src.groupMove,
      groupMoveTimeline: src.groupMoveTimeline,
      timeline: src.timeline,
      appearAt: src.appearAt,
      destroyAt: src.destroyAt,
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
