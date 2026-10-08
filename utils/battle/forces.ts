export type ForceDefinition = { name: string; color: string };

export type ForceValidationError =
  | "nameRequired"
  | "nameTooLong"
  | "duplicate"
  | "color";

export function validateForce(
  name: string,
  color: string,
  forces: ForceDefinition[]
): ForceValidationError | null {
  if (!name.trim()) return "nameRequired";
  if (name.length > 64) return "nameTooLong";
  if (
    forces.some(
      (force) =>
        force.name.trim().toLowerCase() === name.trim().toLowerCase()
    )
  ) {
    return "duplicate";
  }
  if (!/^#[0-9a-f]{6}$/i.test(color)) return "color";
  return null;
}

export function getForceColor(
  forces: ForceDefinition[],
  name: string | undefined
): string | undefined {
  return forces.find(
    (force) =>
      force.name === name && /^#[0-9a-f]{6}$/i.test(force.color)
  )?.color;
}
