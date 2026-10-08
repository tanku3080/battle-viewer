"use client";

import { useI18n } from "@/i18n/I18nProvider";

type Props = {
  viewMode: "map" | "camera";
  setViewMode: (mode: "map" | "camera") => void;
};

export function ViewModeButtons({ viewMode, setViewMode }: Props) {
  const { t } = useI18n();

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        className={`min-h-11 rounded border px-2.5 py-2 text-sm ${viewMode === "map" ? "bg-blue-600" : "bg-gray-700"}`}
        aria-pressed={viewMode === "map"}
        onClick={() => setViewMode("map")}
      >
        {t("view.overview")}
      </button>
      <button
        type="button"
        className={`min-h-11 rounded border px-2.5 py-2 text-sm ${viewMode === "camera" ? "bg-blue-600" : "bg-gray-700"}`}
        aria-pressed={viewMode === "camera"}
        onClick={() => setViewMode("camera")}
      >
        {t("view.camera")}
      </button>
    </div>
  );
}
