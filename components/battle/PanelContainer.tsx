"use client";

import { SelectedInfoPanel } from "@/components/SelectedInfoPanel";
import type { PanelData } from "@/hook/useSelection";

type Props = {
  panelData: PanelData | null;
  currentTime: number;
  viewMode?: "map" | "camera";
};

/**
 * 右サイドパネル
 * - 選択されているときだけ表示
 * - 幅260px固定、スクロール可
 */
export function PanelContainer({ panelData, currentTime }: Props) {
  if (!panelData) return null;

  return (
    <aside className="w-[260px] h-full bg-[#0f1624] border-l border-gray-700 p-3 flex flex-col shrink-0 overflow-y-auto">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-gray-300 text-xs">選択詳細</span>
        <span className="text-[11px] text-gray-500">
          t = {currentTime.toFixed(2)}s
        </span>
      </div>

      {/* 内容エリア */}
      <div className="flex-1">
        <SelectedInfoPanel
          type={panelData.type}
          name={panelData.name}
          id={panelData.id}
          force={panelData.force}
          iconPath={panelData.iconPath}
          currentPosition={panelData.currentPosition}
          timelineLength={panelData.timelineLength}
          appearAt={panelData.appearAt}
          disappearAt={panelData.disappearAt}
          dirDeg={panelData.dirDeg}
        />
      </div>
    </aside>
  );
}
