"use client";

import React, { useEffect, useRef } from "react";
import { BattlePlayer } from "@/components/battle/BattlePlayer/BattlePlayer";
import type { BattleData } from "@/types/battle";
import { useProductionInput } from "./useProductionInput";
import { useI18n } from "@/i18n/I18nProvider";

type Props = {
  battle: BattleData | null;
  productionTime: number;
  isOpen: boolean;
  showGrid: boolean;
  onClose: () => void;
};

export const ProductionModal: React.FC<Props> = ({ battle, productionTime, isOpen, showGrid, onClose }) => {
  const { t } = useI18n();
  useProductionInput(isOpen, onClose);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

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
    <dialog
      ref={dialogRef}
      aria-labelledby="production-dialog-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      className="fixed inset-0 m-0 h-screen max-h-none w-screen max-w-none border-0 bg-black/95 p-0 text-white backdrop:bg-black/95"
    >
      <h2 id="production-dialog-title" className="sr-only">{t("production.title")}</h2>
      <div className="w-full h-full">
        <BattlePlayer battle={battle} currentTime={productionTime} viewMode="camera" showGrid={showGrid} enableSelection={false} />
      </div>
      <button
        ref={closeButtonRef}
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 px-3 py-2 rounded bg-black/70 border border-gray-600 text-white"
      >
        {t("production.end")}
      </button>
    </dialog>
  );
};
