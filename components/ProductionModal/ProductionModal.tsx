"use client";

import React from "react";
import { BattlePlayer } from "@/components/battle/BattlePlayer/BattlePlayer";
import type { BattleData } from "@/types/battle";
import { useProductionInput } from "./useProductionInput";

type Props = {
  battle: BattleData | null;
  productionTime: number;
  isOpen: boolean;
  onClose: () => void;
};

export const ProductionModal: React.FC<Props> = ({
  battle,
  productionTime,
  isOpen,
  onClose,
}) => {
  useProductionInput(isOpen, onClose);

  if (!isOpen || !battle) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/95">
      <div className="w-full h-full">
        <BattlePlayer
          battle={battle}
          currentTime={productionTime}
          viewMode="camera"
          showGrid={false}
          enableSelection={false}
        />
      </div>
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 px-3 py-2 rounded bg-black/70 border border-gray-600 text-white"
      >
        終了 (Esc / Space)
      </button>
    </div>
  );
};
