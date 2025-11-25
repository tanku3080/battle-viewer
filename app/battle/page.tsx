"use client";

import { ChangeEvent, useState } from "react";

import { useBattlePlayback } from "@/hook/useBattlePlayback";
import { useSelection } from "@/hook/useSelection";
import { loadBattleJson } from "@/utils/battle/loadBattleJson";

import { PageHeader } from "@/components/layout/PageHeader";
import { PlaybackControls } from "@/components/battle/controls/PlaybackControls";
import { ViewModeButtons } from "@/components/battle/controls/ViewModeButtons";
import { PanelContainer } from "@/components/battle/PanelContainer";
import { TimelineBar } from "@/components/TimelineBar";
import { ProductionModal } from "@/components/ProductionModal/ProductionModal";
import { BattlePlayer } from "@/components/battle/BattlePlayer/BattlePlayer";

import type { BattleData } from "@/types/battle";

export default function BattlePage() {
  const [battle, setBattle] = useState<BattleData | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "camera">("map");
  const [showGrid, setShowGrid] = useState(false);

  const {
    currentTime,
    maxTime,
    isPlaying,
    start,
    stop,
    seek,

    productionTime,
    isProductionOpen,
    startProduction,
    closeProduction,

    setCurrentTime,
    setIsPlaying,
  } = useBattlePlayback(battle);

  const {
    selectedUnitId,
    selectedCharacterId,
    selectUnit,
    selectCharacter,
    panelData,
  } = useSelection(battle, currentTime);

  // ----------------------------------------
  // JSON読み込み
  // ----------------------------------------
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const parsed = loadBattleJson(JSON.parse(text) as BattleData);

    setBattle(parsed);
    seek(0);
    stop();
  };

  return (
    <main className="min-h-screen bg-[#050816] text-gray-200 p-6 flex flex-col gap-4">
      {/* ヘッダー */}
      <PageHeader onSelectFile={handleFileChange} />

      {/* 再生・モード操作 */}
      <section className="flex gap-4 items-center">
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

        <button
          onClick={startProduction}
          disabled={!battle}
          className="ml-4 px-4 py-2 rounded-md bg-purple-600 text-white disabled:bg-purple-900"
        >
          本番開始
        </button>
      </section>

      {/* メインビュー：左キャンバス + 右パネル */}
      <section className="flex-1 min-h-[500px] rounded-xl border border-gray-700 bg-[#020617] p-2 flex gap-3 overflow-hidden">
        {/* キャンバス */}
        <div className="flex-1 min-w-0 h-full">
          <BattlePlayer
            battle={battle}
            currentTime={currentTime}
            viewMode={viewMode}
            showGrid={showGrid}
            selectedUnitId={selectedUnitId}
            selectedCharacterId={selectedCharacterId}
            onSelectUnit={selectUnit}
            onSelectCharacter={selectCharacter}
            enableSelection={true}
          />
        </div>

        {/* 詳細パネル */}
        {panelData && (
          <PanelContainer
            panelData={panelData}
            currentTime={currentTime}
            viewMode={viewMode}
          />
        )}
      </section>

      {/* タイムライン */}
      <section className="rounded-xl bg-[#111827] p-4">
        <TimelineBar
          currentTime={currentTime}
          maxTime={maxTime}
          onChange={(v) => {
            setCurrentTime(v);
            setIsPlaying(false);
          }}
        />
      </section>

      {/* 本番ビュー */}
      <ProductionModal
        battle={battle}
        productionTime={productionTime}
        isOpen={isProductionOpen}
        onClose={closeProduction}
      />
    </main>
  );
}
