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
