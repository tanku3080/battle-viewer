import {
  canCreatorParent,
  type CreatorHierarchyType,
} from "./hierarchy";
import {
  getCreatorElementVisualState,
  type CreatorTimelinePoint,
} from "./timeline";

export type CreatorEditorItemLike = {
  type: CreatorHierarchyType;
  id: string;
  name: string;
  parentId: string;
};

export function getNextCreatorDefaultName(
  type: CreatorHierarchyType,
  items: CreatorEditorItemLike[]
) {
  const next = items.filter((item) => item.type === type).length + 1;
  return `${type}${next}`;
}

export function isCreatorHierarchyChild(
  child: CreatorEditorItemLike,
  parent: CreatorEditorItemLike
) {
  const parentId = parent.id.trim();
  const childParentId = child.parentId.trim();

  if (!parentId || !childParentId) return false;
  if (childParentId !== parentId) return false;

  return canCreatorParent(child.type, parent.type);
}

export function getCreatorEditorVisualState(args: {
  timeline: CreatorTimelinePoint[];
  appearAt: number;
  destroyEnabled: boolean;
  destroyAt: number;
  t: number;
  isPlaying: boolean;
  fadeDuration?: number;
}) {
  const fadeDuration = args.fadeDuration ?? 0.5;

  if (args.isPlaying) {
    return getCreatorElementVisualState({
      timeline: args.timeline,
      appearAt: args.appearAt,
      destroyEnabled: args.destroyEnabled,
      destroyAt: args.destroyAt,
      t: args.t,
      fadeDuration,
    });
  }

  const spawnAt = args.timeline.length
    ? Math.min(...args.timeline.map((point) => point.t))
    : args.appearAt;

  if (!Number.isFinite(spawnAt) || args.t < spawnAt) {
    return { visible: false, alpha: 0, scale: 0 };
  }

  if (
    args.destroyEnabled &&
    Number.isFinite(args.destroyAt) &&
    args.t >= args.destroyAt + fadeDuration
  ) {
    return { visible: false, alpha: 0, scale: 0 };
  }

  return { visible: true, alpha: 1, scale: 1 };
}
