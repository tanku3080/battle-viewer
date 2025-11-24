"use client";

import React from "react";

type Props = {
  kind: "unit" | "character";
  name: string;
  id: string;
  force?: string;
  currentTime: number;
  x?: number;
  y?: number;
  dirDeg?: number;
};

export const SelectedInfoPanel: React.FC<Props> = ({
  kind,
  name,
  id,
  force,
  currentTime,
  x,
  y,
  dirDeg,
}) => {
  return (
    <aside className="w-72 h-full rounded-lg bg-[#111827] border border-gray-700 p-3 text-sm flex flex-col gap-2">
      <div className="text-xs uppercase tracking-wide text-gray-400">
        {kind === "unit" ? "ユニット情報" : "キャラクター情報"}
      </div>
      <div className="text-lg font-semibold">{name}</div>
      <div className="text-xs text-gray-400 break-all">ID: {id}</div>

      {force && (
        <div className="mt-1">
          <span className="text-gray-400 text-xs">勢力: </span>
          <span>{force}</span>
        </div>
      )}

      <div className="mt-2 border-t border-gray-700 pt-2 space-y-1">
        <div>
          <span className="text-gray-400 text-xs">現在時刻: </span>
          <span>{currentTime.toFixed(2)} s</span>
        </div>

        {x !== undefined && y !== undefined && (
          <div>
            <span className="text-gray-400 text-xs">位置: </span>
            <span>
              x: {x.toFixed(1)}, y: {y.toFixed(1)}
            </span>
          </div>
        )}

        {dirDeg !== undefined && (
          <div>
            <span className="text-gray-400 text-xs">向き: </span>
            <span>{dirDeg.toFixed(1)}°</span>
          </div>
        )}
      </div>

      <div className="mt-auto text-[11px] text-gray-500">
        キャンバス上をクリックして対象を切り替え。
        ユニットとキャラはどちらか1つだけ選択される。
      </div>
    </aside>
  );
};
