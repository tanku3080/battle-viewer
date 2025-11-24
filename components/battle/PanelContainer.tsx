"use client";

import { SelectedInfoPanel } from "@/components/SelectedInfoPanel";
import type { PanelData } from "@/hook/useSelection";

type Props = {
  panelData: PanelData | null;
  currentTime: number;
  viewMode?: "map" | "camera"; // ← optional にする
};

export function PanelContainer({ panelData, currentTime }: Props) {
  // 何も選ばれていない時はパネル非表示
  if (!panelData) {
    return (
      <div className="w-[260px] text-gray-500 text-sm flex items-center justify-center">
        何も選択されていません。
      </div>
    );
  }

  return (
    <div className="w-[260px]">
      <SelectedInfoPanel {...panelData} currentTime={currentTime} />
    </div>
  );
}
