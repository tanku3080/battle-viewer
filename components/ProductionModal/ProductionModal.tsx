"use client";

import React, { useEffect, useRef } from "react";
import { BattlePlayer } from "@/components/battle/BattlePlayer/BattlePlayer";
import type { BattleData } from "@/types/battle";
import { useProductionInput } from "./useProductionInput";

type Props = {
  battle: BattleData | null;
  productionTime: number;
  isOpen: boolean;
  showGrid: boolean;
  onClose: () => void;
};

export const ProductionModal: React.FC<Props> = ({
  battle,
  productionTime,
  isOpen,
  showGrid,
  onClose,
}) => {
  useProductionInput(isOpen, onClose);
  const dialogRef = useRef<HTMLDialogElement | null>(null);\n  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    closeButtonRef.current?.focus();
    return () => {
      if (dialog?.open) dialog.close();
      previousFocus?.focus();
    };
  }, [isOpen]);

  if (!isOpen || !battle) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/95" role="dialog" aria-modal="true" aria-labelledby="production-dialog-title">\n      <h2 id="production-dialog-title" className="sr-only">本番表示</h2>
      <div className="w-full h-full">
        <BattlePlayer
          battle={battle}
          currentTime={productionTime}
          viewMode="camera"
          showGrid={showGrid}
          enableSelection={false}
        />
      </div>
      <button
        ref={closeButtonRef}
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 px-3 py-2 rounded bg-black/70 border border-gray-600 text-white"
      >
        終了 (Esc / Space)
      </button>
    </div>
  );
};
