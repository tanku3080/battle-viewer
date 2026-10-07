import { canCreatorParent, type CreatorHierarchyType } from "./hierarchy";

export type CreatorEditorItemLike = {
  type: CreatorHierarchyType;
  id: string;
  parentId: string;
  name?: string;
};

export function getNextCreatorDefaultName(
  type: CreatorHierarchyType,
  items: CreatorEditorItemLike[]
) {
  const sameTypeCount = items.filter((item) => item.type === type).length;
  return `${type}${sameTypeCount + 1}`;
}

export function isCreatorChildOf(
  child: CreatorEditorItemLike,
  parent: CreatorEditorItemLike
) {
  const childParentId = child.parentId.trim();
  const parentId = parent.id.trim();

  if (!childParentId || !parentId) return false;
  if (childParentId !== parentId) return false;

  return canCreatorParent(child.type, parent.type);
}

export function getCreatorEditingVisualState(args: {
  timeline: Array<{ t: number }>;
  appearAt: number;
  destroyEnabled: boolean;
  destroyAt: number;
  t: number;
  fadeDuration: number;
}) {
  const { timeline, appearAt, destroyEnabled, destroyAt, t, fadeDuration } = args;
  const spawnAt = timeline.length > 0
    ? Math.min(...timeline.map((point) => point.t))
    : appearAt;

  if (!Number.isFinite(spawnAt) || t < spawnAt) {
    return { visible: false, alpha: 0, scale: 0 };
  }

  if (
    destroyEnabled &&
    Number.isFinite(destroyAt) &&
    t >= destroyAt + fadeDuration
  ) {
    return { visible: false, alpha: 0, scale: 0 };
  }

  return { visible: true, alpha: 1, scale: 1 };
}
