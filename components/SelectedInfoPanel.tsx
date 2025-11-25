"use client";

import React from "react";

type Props = {
  type: "unit" | "character";
  name: string;
  id: string;
  force?: string;
  iconPath: string | null;
  currentPosition: { x: number; y: number } | null;
  timelineLength: number;
  appearAt: number;
  disappearAt: number;
  dirDeg?: number;
};

export const SelectedInfoPanel: React.FC<Props> = ({
  type,
  name,
  id,
  force,
  iconPath,
  currentPosition,
  timelineLength,
  appearAt,
  disappearAt,
  dirDeg,
}) => {
  return (
    <aside className="w-full h-full rounded-lg bg-[#111827] border border-gray-700 p-3 text-sm flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="px-2 py-[2px] rounded-full border border-gray-600 text-[11px] text-gray-200">
          {type === "unit" ? "UNIT" : "CHARACTER"}
        </span>
        <span className="text-[11px] text-gray-400 break-all">ID: {id}</span>
      </div>

      <div className="flex items-center gap-3">
        {iconPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={iconPath}
            alt={`${name} icon`}
            className="w-10 h-10 rounded-md object-contain bg-[#0b1020] border border-gray-700"
          />
        ) : (
          <div className="w-10 h-10 rounded-md bg-[#0b1020] border border-gray-700 flex items-center justify-center text-[10px] text-gray-500">
            no icon
          </div>
        )}
        <div className="flex flex-col leading-tight">
          <div className="text-lg font-semibold">{name}</div>
          {force && (
            <div className="text-xs text-gray-400">
              <span className="mr-1 text-gray-500">勢力</span>
              {force}
            </div>
          )}
        </div>
      </div>

      <dl className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-gray-400 text-xs">現在位置</dt>
          <dd className="text-right">
            {currentPosition
              ? `x: ${currentPosition.x.toFixed(1)}, y: ${currentPosition.y.toFixed(1)}`
              : "取得不可"}
          </dd>
        </div>

        {dirDeg !== undefined && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-gray-400 text-xs">dir</dt>
            <dd className="text-right">{dirDeg.toFixed(1)}°</dd>
          </div>
        )}

        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-gray-400 text-xs">timeline length</dt>
          <dd className="text-right">{timelineLength}</dd>
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-gray-400 text-xs">appearAt</dt>
          <dd className="text-right">{appearAt.toFixed(2)} s</dd>
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-gray-400 text-xs">disappearAt</dt>
          <dd className="text-right">{disappearAt.toFixed(2)} s</dd>
        </div>

        <div className="flex flex-col gap-1">
          <dt className="text-gray-400 text-xs">iconPath</dt>
          <dd className="text-xs text-gray-200 break-all">
            {iconPath ?? "無し"}
          </dd>
        </div>
      </dl>

      <div className="mt-auto text-[11px] text-gray-500 leading-relaxed">
        キャンバスをクリックして unit / character を切り替え。
        どちらか1つだけ選択されます。
      </div>
    </aside>
  );
};
