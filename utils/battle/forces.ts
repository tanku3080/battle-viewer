export type ForceDefinition = { name: string; color: string };

export function validateForce(name: string, color: string, forces: ForceDefinition[]): string | null {
  if (!name.trim()) return "force名を入力してください";
  if (name.length > 64) return "force名は64文字以内で入力してください";
  if (forces.some((force) => force.name.trim().toLowerCase() === name.trim().toLowerCase())) {
    return "同じ名前のforceが既に登録されています";
  }
  if (!/^#[0-9a-f]{6}$/i.test(color)) return "カラーを選択してください";
  return null;
}

export function getForceColor(forces: ForceDefinition[], name: string | undefined): string | undefined {
  return forces.find((force) => force.name === name && /^#[0-9a-f]{6}$/i.test(force.color))?.color;
}
