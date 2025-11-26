// 出現/消滅アニメ状態（0.5秒）
export function getSpawnState(
  t: number,
  spawnTime: number,
  despawnTime: number,
  fadeDuration: number
) {
  if (t < spawnTime) {
    return { visible: false, alpha: 0, scale: 0 };
  }

  if (t >= spawnTime && t < spawnTime + fadeDuration) {
    const ratio = (t - spawnTime) / fadeDuration;
    const alpha = ratio;
    const scale = 0.2 + 0.8 * ratio;
    return { visible: true, alpha, scale };
  }

  if (t >= spawnTime + fadeDuration && t <= despawnTime) {
    return { visible: true, alpha: 1, scale: 1 };
  }

  if (t > despawnTime && t <= despawnTime + fadeDuration) {
    const ratio = 1 - (t - despawnTime) / fadeDuration;
    if (ratio <= 0) {
      return { visible: false, alpha: 0, scale: 0 };
    }
    const alpha = ratio;
    const scale = 0.2 + 0.8 * ratio;
    return { visible: true, alpha, scale };
  }

  return { visible: false, alpha: 0, scale: 0 };
}
