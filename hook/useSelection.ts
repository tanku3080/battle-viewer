"use client";

import { useState, useMemo } from "react";
import type { BattleData } from "@/types/battle";
import { getSmoothTransform } from "@/components/battle/BattlePlayer/transform";

/** Panel 用データ型（PanelContainer.tsx がこれを要求している） */
export type PanelData =
  | {
      kind: "unit";
      id: string;
      name: string;
      force: string;
      x?: number;
      y?: number;
      dirDeg?: number;
    }
  | {
      kind: "character";
      id: string;
      name: string;
      x?: number;
      y?: number;
      dirDeg?: number;
      force?: undefined;
    };

export function useSelection(battle: BattleData | null, currentTime: number) {
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    null
  );

  const selectUnit = (id: string | null) => {
    setSelectedUnitId(id);
    setSelectedCharacterId(null);
  };

  const selectCharacter = (id: string | null) => {
    setSelectedCharacterId(id);
    setSelectedUnitId(null);
  };

  const panelData: PanelData | null = useMemo(() => {
    if (!battle) return null;

    // キャラクター
    if (selectedCharacterId) {
      const ch = battle.characters?.find((c) => c.id === selectedCharacterId);
      if (!ch) return null;

      const tr = getSmoothTransform(ch.timeline, currentTime);

      return {
        kind: "character",
        id: ch.id,
        name: ch.name,
        x: tr?.x,
        y: tr?.y,
        dirDeg: tr ? (tr.dir ?? 0) * (180 / Math.PI) : undefined,
      };
    }

    // ユニット
    if (selectedUnitId) {
      const u = battle.units.find((u) => u.id === selectedUnitId);
      if (!u) return null;

      const tr = getSmoothTransform(u.timeline, currentTime);

      return {
        kind: "unit",
        id: u.id,
        name: u.name,
        force: u.force,
        x: tr?.x,
        y: tr?.y,
        dirDeg: tr ? (tr.dir ?? 0) * (180 / Math.PI) : undefined,
      };
    }

    return null;
  }, [battle, currentTime, selectedUnitId, selectedCharacterId]);

  return {
    selectedUnitId,
    selectedCharacterId,
    selectUnit,
    selectCharacter,
    panelData,
  };
}
