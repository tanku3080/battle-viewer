"use client";

import { useI18n } from "@/i18n/I18nProvider";

type PlaybackProps = {
  currentTime: number;
  isPlaying: boolean;
  onStart: () => void;
  onStop: () => void;
};

export function PlaybackControls({ currentTime, isPlaying, onStart, onStop }: PlaybackProps) {
  const { t } = useI18n();
  return (
    <div className="flex gap-4 items-center">
      <button onClick={onStart} className="px-4 py-2 rounded-md bg-green-600 text-white">{t("playback.start")}</button>
      <button onClick={onStop} disabled={!isPlaying} className="px-4 py-2 rounded-md bg-red-600 disabled:bg-red-900 text-white">{t("playback.stop")}</button>
      <span className="opacity-80 text-sm" role="status" aria-live="polite" aria-atomic="true">
        {t("playback.current", { time: currentTime.toFixed(1) })}
      </span>
    </div>
  );
}
