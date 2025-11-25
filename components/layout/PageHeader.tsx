"use client";

import Link from "next/link";

type Props = {
  onSelectFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export function PageHeader({ onSelectFile }: Props) {
  return (
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
          onChange={onSelectFile}
        />

        <Link
          href="/"
          className="px-4 py-2 border border-gray-600 rounded-md text-gray-200"
        >
          タイトルに戻る
        </Link>
      </div>
    </section>
  );
}
