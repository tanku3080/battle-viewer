"use client";

import { SelectedInfoPanel } from "@/components/SelectedInfoPanel";
import type { PanelData } from "@/hook/useSelection";
import { useI18n } from "@/i18n/I18nProvider";

type Props = { panelData: PanelData | null; currentTime: number; viewMode?: "map" | "camera" };

export function PanelContainer({ panelData, currentTime }: Props) {
  const { t } = useI18n();
  if (!panelData) return null;

  return (
    <aside className="min-h-0 w-full shrink-0 overflow-y-auto border-t border-gray-700 bg-[#0f1624] p-3 md:h-full md:w-[260px] md:border-l md:border-t-0">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-gray-300 text-xs">{t("selected.details")}</span>
        <span className="text-[11px] text-gray-500">t = {currentTime.toFixed(2)}s</span>
      </div>
      <div className="flex-1">
        <SelectedInfoPanel
          type={panelData.type}
          name={panelData.name}
          description={panelData.description}
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
