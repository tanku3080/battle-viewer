// utils/battle/spawnUtils.ts

/**
 * 0.5秒でフェードイン/フェードアウトする出現アニメ
 */
export function getSpawnState(
  t: number,
  spawnTime: number,
  despawnTime: number,
  fadeDuration: number
) {
  // 出現前
  if (t < spawnTime) {
    return { visible: false, alpha: 0, scale: 0 };
  }

  // フェードイン
  if (t >= spawnTime && t < spawnTime + fadeDuration) {
    const ratio = (t - spawnTime) / fadeDuration;
    return {
      visible: true,
      alpha: ratio,
      scale: 0.2 + 0.8 * ratio,
    };
  }

  // 通常状態
  if (t >= spawnTime + fadeDuration && t <= despawnTime) {
    return { visible: true, alpha: 1, scale: 1 };
  }

  // フェードアウト
  if (t > despawnTime && t <= despawnTime + fadeDuration) {
    const ratio = 1 - (t - despawnTime) / fadeDuration;
    return {
      visible: ratio > 0,
      alpha: ratio,
      scale: 0.2 + 0.8 * ratio,
    };
  }

  // 消滅後
  return { visible: false, alpha: 0, scale: 0 };
}
