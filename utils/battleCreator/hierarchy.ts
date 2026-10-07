export type CreatorHierarchyType =
  | "unit"
  | "character"
  | "legion"
  | "corps"
  | "division"
  | "regiment"
  | "camera";

export function expectedCreatorParentType(
  type: CreatorHierarchyType
): CreatorHierarchyType | null {
  if (type === "corps") return "legion";
  if (type === "division") return "corps";
  if (type === "regiment") return "division";
  if (type === "unit") return "regiment";
  return null;
}

export function canCreatorParent(
  child: CreatorHierarchyType,
  parent: CreatorHierarchyType
) {
  return expectedCreatorParentType(child) === parent;
}

type CreatorHierarchyRelationItem = {
  type: CreatorHierarchyType;
  id: string;
  parentId: string;
};

/**
 * Creator上の親子関係を判定する。
 * 未入力ID（空文字・空白）同士を同一IDとして扱ってはいけない。
 */
export function isCreatorParentOf(
  parent: CreatorHierarchyRelationItem,
  child: CreatorHierarchyRelationItem
) {
  const parentId = parent.id.trim();
  const childParentId = child.parentId.trim();

  return (
    parentId.length > 0 &&
    childParentId.length > 0 &&
    childParentId === parentId &&
    canCreatorParent(child.type, parent.type)
  );
}

export function canCreatorHaveManualParent(
  type: CreatorHierarchyType
) {
  return ["corps", "division", "regiment", "unit"].includes(type);
}

export function isCreatorBattleRootOnly(
  type: CreatorHierarchyType
) {
  return type === "legion" || type === "character";
}
