export type CreatorItemType =
  | "unit"
  | "character"
  | "legion"
  | "corps"
  | "division"
  | "regiment"
  | "camera";

type CreatorNamedItem = {
  type: CreatorItemType;
  id: string;
  name: string;
};

export function getCreatorDefaultName(
  type: CreatorItemType,
  items: Array<{ type: CreatorItemType }>
) {
  const nextNumber =
    items.filter((item) => item.type === type).length + 1;
  return `${type}${nextNumber}`;
}

export function getCreatorDisplayName(item: CreatorNamedItem) {
  return item.name.trim() || item.id.trim() || item.type;
}
