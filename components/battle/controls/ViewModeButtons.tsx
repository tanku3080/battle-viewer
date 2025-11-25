"use client";

type Props = {
  viewMode: "map" | "camera";
  setViewMode: (mode: "map" | "camera") => void;

  showGrid: boolean;
  setShowGrid: (v: boolean) => void;
};

export function ViewModeButtons({
  viewMode,
  setViewMode,
  showGrid,
  setShowGrid,
}: Props) {
  return (
    <div className="flex gap-4 items-center">
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
    </div>
  );
}
