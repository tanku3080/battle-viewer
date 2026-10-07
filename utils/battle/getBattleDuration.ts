import type { BattleData } from "@/types/battle";

/**
 * JSON側にdurationを重複保持せず、実データの最大tから再生時間を決める。
 */
export function getBattleDuration(battle: BattleData | null): number {
  if (!battle) return 0;

  let maxTime = 0;
  const include = (value: number) => {
    if (Number.isFinite(value) && value > maxTime) maxTime = value;
  };

  battle.units.forEach((unit) => {
    unit.timeline.forEach((point) => include(point.t));
    if (unit.destroyAt !== undefined) include(unit.destroyAt);
  });
  battle.characters.forEach((character) => {
    character.timeline.forEach((point) => include(point.t));
    if (character.destroyAt !== undefined) include(character.destroyAt);
  });
  battle.camera.forEach((camera) => include(camera.t));
  battle.events.forEach((event) => include(event.t));
  Object.values(battle.hierarchy?.nodes ?? {}).forEach((node) => {
    node.timeline?.forEach((point) => include(point.t));
    if (node.appearAt !== undefined) include(node.appearAt);
    if (node.destroyAt !== undefined) include(node.destroyAt);
  });

  return maxTime;
}
