"use client";

import Link from "next/link";
import { useState, useRef, useEffect, ChangeEvent } from "react";
import type {
  BattleData,
  Unit,
  Character,
  TimelinePoint,
} from "../../types/battle";
import { TimelineBar } from "@/components/TimelineBar";
import { BattlePlayer } from "@/components/BattlePlayer";

export default function BattlePage() {
  const [battle, setBattle] = useState<BattleData | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [maxTime, setMaxTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const [viewMode, setViewMode] = useState<"map" | "camera">("map");
  const [showGrid, setShowGrid] = useState(false);

  const lastFrameTimeRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);

  // JSON読み込み
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const parsed = JSON.parse(text) as BattleData;

    setBattle(parsed);

    const times: number[] = [];
    parsed.units.forEach((u: Unit) =>
      u.timeline.forEach((p: TimelinePoint) => times.push(p.t))
    );
    parsed.characters?.forEach((c: Character) =>
      c.timeline.forEach((p: TimelinePoint) => times.push(p.t))
    );

    const max = times.length ? Math.max(...times) : 0;
    setMaxTime(max);
    setCurrentTime(0);
    setIsPlaying(false);
  };

  // === 再生ループ ===
  useEffect(() => {
    if (!isPlaying) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      lastFrameTimeRef.current = null;
      return;
    }

    const loop = (timestamp: number) => {
      if (!lastFrameTimeRef.current) {
        lastFrameTimeRef.current = timestamp;
      }
      const delta = timestamp - lastFrameTimeRef.current;
      lastFrameTimeRef.current = timestamp;

      setCurrentTime((prev) => {
        const next = prev + delta / 1000;
        if (next >= maxTime) {
          setIsPlaying(false);
          return maxTime;
        }
        return next;
      });

      rafIdRef.current = requestAnimationFrame(loop);
    };

    rafIdRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    };
  }, [isPlaying, maxTime]);

  return (
    <main className="min-h-screen bg-[#050816] text-gray-200 p-6 flex flex-col gap-4">
      {/* ヘッダー */}
      <section className="rounded-xl p-4 bg-[#111827] flex flex-col gap-3">
        <div className="flex gap-4 items-center">
          <button
            onClick={() => document.getElementById("json-input")?.click()}
            className="px-4 py-2 bg-blue-600 rounded-md text-white font-semibold"
          >
            JSONを読み込む
          </button>

          <input
            id="json-input"
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileChange}
          />

          <Link
            href="/"
            className="px-4 py-2 border border-gray-600 rounded-md text-gray-200"
          >
            タイトルに戻る
          </Link>
        </div>

        {/* 読み込んだ情報 */}
        <div className="text-sm opacity-80">
          {battle ? (
            <>
              <div>タイトル：{battle.title}</div>
              <div>
                部隊数：{battle.units.length}　 キャラクター：
                {battle.characters ? battle.characters.length : 0}
              </div>
              <div>タイムライン：0〜{maxTime.toFixed(1)} 秒</div>
            </>
          ) : (
            <div>JSONを読み込むと戦場情報がここに出る。</div>
          )}
        </div>
      </section>

      {/* 再生＆モード切替 */}
      <section className="flex gap-4 items-center">
        <button
          onClick={() => {
            if (!battle) return;

            if (isPlaying || currentTime >= maxTime) {
              setCurrentTime(0);
              requestAnimationFrame(() => setIsPlaying(true));
            } else {
              setIsPlaying(true);
            }
          }}
          disabled={!battle}
          className="px-4 py-2 rounded-md bg-green-600 disabled:bg-green-900 text-white"
        >
          START
        </button>

        <button
          onClick={() => setIsPlaying(false)}
          disabled={!battle || !isPlaying}
          className="px-4 py-2 rounded-md bg-red-600 disabled:bg-red-900 text-white"
        >
          STOP
        </button>

        <span className="opacity-80 text-sm">
          現在：{currentTime.toFixed(1)} s
        </span>

        {/* モード切り替え + グリッド */}
        {battle && (
          <>
            <button
              className={`px-3 py-2 rounded border ${
                viewMode === "map" ? "bg-blue-600" : "bg-gray-700"
              }`}
              onClick={() => setViewMode("map")}
            >
              全体
            </button>

            <button
              className={`px-3 py-2 rounded border ${
                viewMode === "camera" ? "bg-blue-600" : "bg-gray-700"
              }`}
              onClick={() => setViewMode("camera")}
            >
              カメラ
            </button>

            <label className="flex items-center gap-2 ml-4">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
              />
              <span>グリッド表示</span>
            </label>
          </>
        )}
      </section>

      {/* キャンバス */}
      <section className="flex-1 min-h-[500px] rounded-xl border border-gray-700 bg-[#020617] p-2">
        {battle ? (
          <BattlePlayer
            battle={battle}
            currentTime={currentTime}
            viewMode={viewMode}
            showGrid={showGrid}
          />
        ) : (
          <div className="opacity-60 text-sm">まず JSON を読み込め。</div>
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
    </main>
  );
}
