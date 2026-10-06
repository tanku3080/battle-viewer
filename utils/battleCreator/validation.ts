export type CreatorElementType =
  | "unit"
  | "character"
  | "legion"
  | "corps"
  | "division"
  | "regiment"
  | "camera";

export type CreatorValidatableItem = {
  type: CreatorElementType;
  id: string;
  zoom: number;
};

export function getMissingRequiredFields(
  item: CreatorValidatableItem
): string[] {
  if (item.type === "camera") {
    return Number.isFinite(item.zoom) ? [] : ["zoom"];
  }

  return item.id.trim() ? [] : ["id"];
}

export function hasMissingRequiredFields(
  item: CreatorValidatableItem
): boolean {
  return getMissingRequiredFields(item).length > 0;
}
