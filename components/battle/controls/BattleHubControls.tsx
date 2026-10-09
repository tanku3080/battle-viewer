"use client";

import { useState } from "react";
import type { RawBattleJson } from "@/utils/battle/loadBattleJson";
import { BattleHubAccessButton } from "@/components/battleHub/BattleHubAccessButton";
import { useI18n } from "@/i18n/I18nProvider";

/** The single supported publishing flow now lives in the distributed Hub. */
export function BattleHubControls({ battleJson }: { battleJson: RawBattleJson | null }) {
  const { t } = useI18n();
  const [desktopPanelOpen, setDesktopPanelOpen] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="sr-only" role="status">{battleJson ? t("hub.readyToPublish") : t("hub.publishFromHub")}</span>
      <BattleHubAccessButton className="min-h-11" />
      <div className="relative hidden lg:block">
        <button type="button" aria-expanded={desktopPanelOpen}
          aria-controls="battle-hub-desktop-panel"
          aria-label={desktopPanelOpen ? t("hubAccess.panelClose") : t("hubAccess.panelOpen")}
          onClick={() => setDesktopPanelOpen((value) => !value)}
          className="min-h-11 rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">
          {desktopPanelOpen ? "Battle Hub ◀" : "Battle Hub ▶"}
        </button>
        {desktopPanelOpen && (
          <aside id="battle-hub-desktop-panel"
            className="absolute right-0 top-full z-40 mt-2 min-w-64 rounded-lg border border-gray-700 bg-[#111827] p-3 shadow-xl">
            <p className="mb-2 text-xs text-gray-400">{t("hub.publishFromHub")}</p>
            <BattleHubAccessButton className="w-full" />
          </aside>
        )}
      </div>
    </div>
  );
}
