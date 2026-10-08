"use client";

import { useI18n } from "@/i18n/I18nProvider";

type PlaybackProps = {
  isPlaying: boolean;
  onStart: () => void;
  onStop: () => void;
};

export function PlaybackControls({ isPlaying, onStart, onStop }: PlaybackProps) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onStart}
        className="min-h-11 rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700"
      >
        {t("playback.start")}
      </button>
      <button
        type="button"
        onClick={onStop}
        disabled={!isPlaying}
        className="min-h-11 rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:bg-red-900 disabled:text-gray-300"
      >
        {t("playback.stop")}
      </button>
    </div>
  );
}
