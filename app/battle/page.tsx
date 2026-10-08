"use client";

import Link from "next/link";
import { ChangeEvent, useState } from "react";
import type { BattleData } from "@/types/battle";
import { useBattlePlayback } from "@/hook/useBattlePlayback";
import { useSelection } from "@/hook/useSelection";
import { loadBattleJson, type RawBattleJson } from "@/utils/battle/loadBattleJson";
import { PlaybackControls } from "@/components/battle/controls/PlaybackControls";
import { ViewModeButtons } from "@/components/battle/controls/ViewModeButtons";
import { ProductionButton } from "@/components/battle/controls/ProductionButton";
import { BattleHubControls } from "@/components/battle/controls/BattleHubControls";
import { TimelineBar } from "@/components/TimelineBar";
import { BattlePlayer } from "@/components/battle/BattlePlayer/BattlePlayer";
import { PanelContainer } from "@/components/battle/PanelContainer";
import { ProductionModal } from "@/components/ProductionModal/ProductionModal";
import { useI18n } from "@/i18n/I18nProvider";

export default function BattlePage() {
  const { t } = useI18n();
  const [battle, setBattle] = useState<BattleData | null>(null);
  const [sourceBattleJson, setSourceBattleJson] = useState<RawBattleJson | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "camera">("map");
  const [showGrid, setShowGrid] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const {
    currentTime, maxTime, isPlaying, start, stop, seek, productionTime,
    isProductionOpen, startProduction, closeProduction, setCurrentTime, setIsPlaying,
  } = useBattlePlayback(battle);

  const {
    selectedUnitId, selectedCharacterId, selectUnit, selectCharacter, panelData,
  } = useSelection(battle, currentTime);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const raw = JSON.parse(text) as RawBattleJson;
      const parsed = loadBattleJson(raw);
      setBattle(parsed);
      setSourceBattleJson(raw);
      setLoadError(null);
      seek(0);
      stop();
      selectUnit(null);
      selectCharacter(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t("battle.loadFailed"));
    }
  };

  return (
    <main className="w-screen h-screen overflow-hidden bg-[#050816] text-gray-200 flex flex-col">
      <div className="w-full flex items-center gap-4 p-3 border-b border-gray-700">
        <input id="json-input" type="file" accept="application/json,.json" className="hidden" onChange={handleFileChange} />
        <button
          onClick={() => (document.getElementById("json-input") as HTMLInputElement | null)?.click()}
          className="px-4 py-2 bg-blue-600 rounded-md text-white hover:bg-blue-700"
        >
          {t("battle.loadJson")}
        </button>
        <Link className="px-4 py-2 rounded-md bg-gray-600 text-white" href="/home">{t("battle.back")}</Link>

        <PlaybackControls currentTime={currentTime} isPlaying={isPlaying} onStart={start} onStop={stop} />
        <ViewModeButtons viewMode={viewMode} setViewMode={setViewMode} showGrid={showGrid} setShowGrid={setShowGrid} />
        <ProductionButton disabled={!battle} onStart={startProduction} />
        <BattleHubControls battleJson={sourceBattleJson} />
      </div>

      {loadError && (
        <div role="alert" className="px-4 py-2 bg-red-950 text-red-200 border-b border-red-800 text-sm">
          {t("battle.loadError", { message: loadError })}
        </div>
      )}

      <div className="flex-1 relative overflow-hidden flex pb-[72px]">
        <div className="flex-1">
          <BattlePlayer
            battle={battle}
            currentTime={currentTime}
            viewMode={viewMode}
            showGrid={showGrid}
            selectedUnitId={selectedUnitId}
            selectedCharacterId={selectedCharacterId}
            onSelectUnit={selectUnit}
            onSelectCharacter={selectCharacter}
            enableSelection
          />
        </div>
        <PanelContainer panelData={panelData} currentTime={currentTime} />
      </div>

      <div className="w-full fixed bottom-0 left-0 bg-[#111827] border-t border-gray-700 p-4">
        <TimelineBar
          currentTime={currentTime}
          maxTime={maxTime}
          onChange={(value) => { setCurrentTime(value); setIsPlaying(false); }}
        />
      </div>

      <ProductionModal battle={battle} productionTime={productionTime} isOpen={isProductionOpen} showGrid={showGrid} onClose={closeProduction} />
    </main>
  );
}
