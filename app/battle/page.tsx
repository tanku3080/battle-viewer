"use client";

import { ChangeEvent, useState } from "react";

import { useBattlePlayback } from "@/hook/useBattlePlayback";
import { useSelection } from "@/hook/useSelection";
import {
  loadBattleJson,
  type RawBattleJson,
} from "@/utils/battle/loadBattleJson";
import { PlaybackControls } from "@/components/battle/controls/PlaybackControls";
import { ViewModeButtons } from "@/components/battle/controls/ViewModeButtons";
import { TimelineBar } from "@/components/TimelineBar";
import { BattlePlayer } from "@/components/battle/BattlePlayer/BattlePlayer";

import { BattleData } from "@/utils/battle/battle";
import { useRouter } from "next/navigation";

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
    const parsed = loadBattleJson(JSON.parse(text) as RawBattleJson);

    setBattle(parsed);
    seek(0);
    stop();
  };

  const router = useRouter();

  return (
    <main className="w-screen h-screen overflow-hidden bg-[#050816] text-gray-200 flex flex-col">
      {/* 上部コントロールバー（1行にまとめる） */}
      <div className="w-full flex items-center gap-4 p-3 border-b border-gray-700">
        {/* hidden input */}
        <input
          id="json-input"
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* JSON 読み込み */}
        <button
          onClick={() => {
            (
              document.getElementById("json-input") as HTMLInputElement
            )?.click();
          }}
          className="px-4 py-2 bg-blue-600 rounded-md text-white hover:bg-blue-700"
        >
          JSONを読み込む
        </button>

        {/* タイトルに戻る */}
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 rounded-md bg-gray-600 text-white"
        >
          タイトルに戻る
        </button>

        {/* 再生コントロール */}
        <PlaybackControls
          currentTime={currentTime}
          isPlaying={isPlaying}
          onStart={start}
          onStop={stop}
        />

        {/* 表示モード切替 */}
        <ViewModeButtons
          viewMode={viewMode}
          setViewMode={setViewMode}
          showGrid={showGrid}
          setShowGrid={setShowGrid}
        />

        {/* 本番開始 */}
        <button
          onClick={startProduction}
          disabled={!battle}
          className="px-4 py-2 rounded-md bg-purple-600 text-white disabled:bg-purple-900"
        >
          本番開始
        </button>
      </div>

      {/* キャンバス */}
      <div className="flex-1 relative overflow-hidden">
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

      {/* シークバー（固定） */}
      <div className="w-full fixed bottom-0 left-0 bg-[#111827] border-t border-gray-700 p-4">
        <TimelineBar
          currentTime={currentTime}
          maxTime={maxTime}
          onChange={(v) => {
            setCurrentTime(v);
            setIsPlaying(false);
          }}
        />
      </div>
    </main>
  );
}
