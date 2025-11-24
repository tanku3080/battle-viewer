"use client";

import type { BattleData, TimelinePoint } from "@/types/battle";

/**
 * dir が存在しない TimelinePoint に向きを自動付与する
 */
function fillDir(timeline: TimelinePoint[]): TimelinePoint[] {
  if (!timeline.length) return timeline;

  return timeline.map((p, i) => {
    if (p.dir !== undefined) return p;

    const next = timeline[i + 1];
    const prev = timeline[i - 1];

    if (next) {
      const dx = next.x - p.x;
      const dy = next.y - p.y;
      return { ...p, dir: Math.atan2(dy, dx) };
    }

    if (prev) {
      return { ...p, dir: prev.dir ?? 0 };
    }

    return { ...p, dir: 0 };
  });
}

/**
 * JSON 読み込み後の battle データ整形
 * dir 補完などの各種加工をここで実施する
 */
export function loadBattleJson(raw: BattleData): BattleData {
  const fixedUnits = raw.units.map((u) => {
    return {
      ...u,
      timeline: fillDir(u.timeline),
    };
  });

  const fixedCharacters =
    raw.characters?.map((c) => {
      return {
        ...c,
        timeline: fillDir(c.timeline),
      };
    }) ?? [];

  return {
    ...raw,
    units: fixedUnits,
    characters: fixedCharacters,
  };
}
