"use client";

import { useI18n } from "@/i18n/I18nProvider";

type Props = {
  viewMode: "map" | "camera";
  setViewMode: (mode: "map" | "camera") => void;
  showGrid: boolean;
  setShowGrid: (v: boolean) => void;
};

export function ViewModeButtons({ viewMode, setViewMode, showGrid, setShowGrid }: Props) {
  const { t } = useI18n();
  return (
    <div className="flex gap-4 items-center">
      <button className={`px-3 py-2 rounded border ${viewMode === "map" ? "bg-blue-600" : "bg-gray-700"}`} aria-pressed={viewMode === "map"} onClick={() => setViewMode("map")}>
        {t("view.overview")}
      </button>
      <button className={`px-3 py-2 rounded border ${viewMode === "camera" ? "bg-blue-600" : "bg-gray-700"}`} aria-pressed={viewMode === "camera"} onClick={() => setViewMode("camera")}>
        {t("view.camera")}
      </button>
      <label className="flex items-center gap-2 ml-4">
        <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
        <span>{t("view.grid")}</span>
      </label>
    </div>
  );
}
