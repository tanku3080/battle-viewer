"use client";

import React from "react";
import { BattlePlayer } from "@/components/battle/BattlePlayer/BattlePlayer";
import type { BattleData } from "@/types/battle";
import { useProductionInput } from "./useProductionInput";

type Props = {
  battle: BattleData | null; // ← ★ null を許可
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

  // battle が無い時はモーダルごと無効化
  if (!isOpen || !battle) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
      <div className="w-full h-full max-w-[100vw] max-h-screen">
        <BattlePlayer
          battle={battle} // ★ battle は必ず非 null で渡るようになる
          currentTime={productionTime}
          viewMode="camera"
          showGrid={false}
          enableSelection={false}
        />
      </div>
    </div>
  );
};
