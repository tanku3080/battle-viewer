"use client";

import { useState, useMemo } from "react";
import type { BattleData, TimelinePoint } from "@/types/battle";
import { getSmoothTransform } from "@/components/battle/BattlePlayer/transform";

/** クリック選択状態 */
export type SelectedEntity =
  | {
      type: "unit" | "character";
      id: string;
    }
  | null;

/** パネル表示用データ */
export type PanelData = {
  type: "unit" | "character";
  id: string;
  name: string;
  iconPath: string | null;
  currentPosition: { x: number; y: number } | null;
  dirDeg?: number;
  timelineLength: number;
  appearAt: number;
  disappearAt: number;
  force?: string;
};

function getTimelineMeta(timeline: TimelinePoint[], currentTime: number) {
  if (!timeline || timeline.length === 0) return null;

  const appearAt = timeline[0]?.t ?? 0;
  const disappearAt = timeline[timeline.length - 1]?.t ?? appearAt;
  const transform = getSmoothTransform(timeline, currentTime);

  const hasDir = timeline.some((p) => p.dir !== undefined);
  const dirDeg =
    hasDir && transform?.dir !== undefined
      ? (transform.dir * 180) / Math.PI
      : undefined;

  return {
    timelineLength: timeline.length,
    appearAt,
    disappearAt,
    currentPosition: transform
      ? {
          x: transform.x,
          y: transform.y,
        }
      : null,
    dirDeg,
  };
}

export function useSelection(battle: BattleData | null, currentTime: number) {
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity>(null);

  const selectUnit = (id: string | null) => {
    setSelectedEntity(id ? { type: "unit", id } : null);
  };

  const selectCharacter = (id: string | null) => {
    setSelectedEntity(id ? { type: "character", id } : null);
  };

  const selectedUnitId =
    selectedEntity?.type === "unit" ? selectedEntity.id : null;
  const selectedCharacterId =
    selectedEntity?.type === "character" ? selectedEntity.id : null;

  const panelData: PanelData | null = useMemo(() => {
    if (!battle || !selectedEntity) return null;

    if (selectedEntity.type === "unit") {
      const unit = battle.units.find((u) => u.id === selectedEntity.id);
      if (!unit) return null;

      const meta = getTimelineMeta(unit.timeline, currentTime);
      if (!meta) return null;

      return {
        type: "unit",
        id: unit.id,
        name: unit.name,
        iconPath: unit.icon ?? null,
        force: unit.force,
        ...meta,
      };
    }

    const character = battle.characters?.find(
      (c) => c.id === selectedEntity.id
    );
    if (!character) return null;

    const meta = getTimelineMeta(character.timeline, currentTime);
    if (!meta) return null;

    return {
      type: "character",
      id: character.id,
      name: character.name,
      iconPath: character.icon ?? null,
      ...meta,
    };
  }, [battle, currentTime, selectedEntity]);

  return {
    selectedEntity,
    selectedUnitId,
    selectedCharacterId,
    selectUnit,
    selectCharacter,
    panelData,
  };
}
