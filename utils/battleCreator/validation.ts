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
  appearAt?: number;
  destroyEnabled?: boolean;
  destroyAt?: number;
};

export function getMissingRequiredFields(
  item: CreatorValidatableItem
): string[] {
  const missing: string[] = [];

  if (item.type === "camera") {
    if (!Number.isFinite(item.zoom) || item.zoom <= 0) {
      missing.push("zoom");
    }
    return missing;
  }

  if (!item.id.trim()) missing.push("id");

  if (item.destroyEnabled) {
    const appearAt = Number.isFinite(item.appearAt) ? item.appearAt! : 0;
    if (
      !Number.isFinite(item.destroyAt) ||
      (item.destroyAt as number) < appearAt
    ) {
      missing.push("destroyAt");
    }
  }

  return missing;
}

export function hasMissingRequiredFields(
  item: CreatorValidatableItem
): boolean {
  return getMissingRequiredFields(item).length > 0;
}
