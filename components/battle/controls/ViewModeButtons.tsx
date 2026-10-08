"use client";

import { useI18n } from "@/i18n/I18nProvider";

type Props = {
  viewMode: "map" | "camera";
  setViewMode: (mode: "map" | "camera") => void;
  showGrid?: boolean;
  setShowGrid?: (value: boolean) => void;
};

export function ViewModeButtons({ viewMode, setViewMode, showGrid, setShowGrid }: Props) {
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
      {showGrid !== undefined && setShowGrid && (
        <label className="flex min-h-11 items-center gap-2 sm:ml-2">
          <input
            type="checkbox"
            checked={showGrid}
            onChange={(event) => setShowGrid(event.target.checked)}
          />
          <span>{t("view.grid")}</span>
        </label>
      )}
    </div>
  );
}
