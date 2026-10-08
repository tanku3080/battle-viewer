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
    <main className="flex min-h-dvh w-full min-w-0 flex-col overflow-x-hidden bg-[#050816] text-gray-200 md:h-dvh md:overflow-hidden">
      <header className="w-full shrink-0 border-b border-gray-700 bg-[#0b1020]">
        <input
          id="json-input"
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="hidden min-w-0 flex-wrap items-center gap-2 p-3 lg:flex lg:gap-3">
          <button
            type="button"
            onClick={() =>
              (document.getElementById("json-input") as HTMLInputElement | null)?.click()
            }
            className="min-h-11 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            {t("battle.loadJson")}
          </button>
          <Link
            className="min-h-11 rounded-md bg-gray-600 px-4 py-2 text-white hover:bg-gray-500"
            href="/home"
          >
            {t("battle.back")}
          </Link>
          <PlaybackControls
            currentTime={currentTime}
            isPlaying={isPlaying}
            onStart={start}
            onStop={stop}
          />
          <ViewModeButtons
            viewMode={viewMode}
            setViewMode={setViewMode}
            showGrid={showGrid}
            setShowGrid={setShowGrid}
          />
          <ProductionButton disabled={!battle} onStart={startProduction} />
          <BattleHubControls battleJson={sourceBattleJson} />
        </div>

        <div className="grid gap-2 p-2 sm:p-3 lg:hidden">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <Link
              className="min-h-11 shrink-0 rounded-md bg-gray-600 px-4 py-2 text-white hover:bg-gray-500"
              href="/home"
            >
              {t("battle.back")}
            </Link>
            <label className="flex min-h-11 min-w-0 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(event) => setShowGrid(event.target.checked)}
                className="h-5 w-5 shrink-0"
              />
              <span className="min-w-0">{t("view.grid")}</span>
            </label>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                (document.getElementById("json-input") as HTMLInputElement | null)?.click()
              }
              className="min-h-11 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              {t("battle.loadJson")}
            </button>
            <BattleHubControls battleJson={sourceBattleJson} />
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
            <PlaybackControls
              isPlaying={isPlaying}
              onStart={start}
              onStop={stop}
            />
            <ViewModeButtons
              viewMode={viewMode}
              setViewMode={setViewMode}
            />
            <ProductionButton disabled={!battle} onStart={startProduction} />
          </div>

          <div
            className="text-sm text-gray-300"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {t("playback.current", { time: currentTime.toFixed(1) })}
          </div>
        </div>
      </header>

      {loadError && (
        <div
          role="alert"
          className="border-b border-red-800 bg-red-950 px-4 py-2 text-sm text-red-200"
        >
          {t("battle.loadError", { message: loadError })}
        </div>
      )}

      <div className="flex min-h-[20rem] flex-1 flex-col md:min-h-0 md:flex-row md:overflow-hidden">
        <div className="min-h-[18rem] min-w-0 flex-1 sm:min-h-[22rem] md:min-h-0">
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

      <div className="w-full shrink-0 border-t border-gray-700 bg-[#111827] p-3 sm:p-4">
        <TimelineBar
          currentTime={currentTime}
          maxTime={maxTime}
          onChange={(value) => {
            setCurrentTime(value);
            setIsPlaying(false);
          }}
        />
      </div>

      <ProductionModal
        battle={battle}
        productionTime={productionTime}
        isOpen={isProductionOpen}
        showGrid={showGrid}
        onClose={closeProduction}
      />
    </main>
  );
}
