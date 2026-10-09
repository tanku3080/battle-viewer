"use client";

import { useEffect, useRef, useState } from "react";
import { BattlePlayer } from "@/components/battle/BattlePlayer/BattlePlayer";
import { TimelineBar } from "@/components/TimelineBar";
import { useBattlePlayback } from "@/hook/useBattlePlayback";
import { loadBattleJson, type RawBattleJson } from "@/utils/battle/loadBattleJson";
import type { BattleData } from "@/types/battle";
import { useI18n } from "@/i18n/I18nProvider";

type Preview = { title: string; raw: string } | null;

export function BattlePreviewDialog({ preview, onClose }: {
  preview: Preview;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const [battle, setBattle] = useState<BattleData | null>(null);
  const [error, setError] = useState("");
  const playback = useBattlePlayback(battle);

  useEffect(() => {
    const dialog = ref.current;
    if (preview && dialog && !dialog.open) dialog.showModal();
    if (!preview && dialog?.open) dialog.close();
  }, [preview]);

  useEffect(() => {
    if (!preview) return;
    let active = true;
    Promise.resolve().then(() => {
      try {
        const parsed = loadBattleJson(JSON.parse(preview.raw) as RawBattleJson);
        if (active) { setBattle(parsed); setError(""); }
      } catch (reason) {
        if (active) {
          setBattle(null);
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      }
    });
    return () => { active = false; };
  }, [preview]);

  if (!preview) return null;

  return (
    <dialog ref={ref} aria-labelledby="hub-preview-title"
      onCancel={(event) => { event.preventDefault(); playback.stop(); onClose(); }}
      className="m-auto flex-col max-h-[calc(100dvh-2rem)] h-[min(85dvh,56rem)] w-[min(95vw,80rem)] overflow-hidden rounded-xl border border-gray-600 bg-[#0b1020] p-0 text-gray-100 shadow-2xl backdrop:bg-black/80">
      <div className="flex h-full min-h-0 flex-col p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="hub-preview-title" className="text-lg font-semibold">{t("hub.preview")}: {preview.title}</h2>
          <button type="button" onClick={() => { playback.stop(); onClose(); }}
            className="min-h-11 rounded bg-gray-700 px-4">{t("publish.close")}</button>
        </div>
        {error ? <p role="alert" className="text-red-300">{error}</p> :
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="min-h-0 flex-1 overflow-hidden rounded border border-gray-700">
              <BattlePlayer battle={battle} currentTime={playback.currentTime}
                viewMode="map" showGrid={false} />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={playback.start}
                className="min-h-11 rounded bg-emerald-700 px-4">{t("playback.start")}</button>
              <button type="button" onClick={playback.stop}
                className="min-h-11 rounded bg-gray-700 px-4">{t("playback.stop")}</button>
              <span className="self-center text-sm">{playback.currentTime.toFixed(1)} s</span>
            </div>
            <TimelineBar currentTime={playback.currentTime}
              maxTime={playback.maxTime} onChange={playback.seek} />
          </div>}
      </div>
    </dialog>
  );
}
