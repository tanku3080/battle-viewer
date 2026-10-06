"use client";

import { FormEvent, useEffect, useState } from "react";
import type { RawBattleJson } from "@/utils/battle/loadBattleJson";
import {
  getBattleHubHealth,
  publishBattleToHub,
} from "@/utils/battleHub/client";

type Props = {
  battleJson: RawBattleJson | null;
};

type HealthState = "checking" | "online" | "offline";

export function BattleHubControls({ battleJson }: Props) {
  const [health, setHealth] = useState<HealthState>("checking");
  const [isOpen, setIsOpen] = useState(false);
  const [authorName, setAuthorName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    getBattleHubHealth(controller.signal)
      .then((result) => {
        setHealth(result.status === "ok" ? "online" : "offline");
      })
      .catch(() => {
        if (!controller.signal.aborted) setHealth("offline");
      });

    return () => controller.abort();
  }, []);

  const handlePublish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!battleJson || !authorName.trim()) return;

    setIsPublishing(true);
    setMessage(null);

    try {
      const result = await publishBattleToHub({
        authorName: authorName.trim(),
        description: description.trim(),
        battleJson,
      });

      setHealth("online");
      setMessage(`投稿完了: ${result.title} (${result.id})`);
    } catch (error) {
      setHealth("offline");
      setMessage(
        error instanceof Error ? error.message : "Battle Hubへの投稿に失敗しました"
      );
    } finally {
      setIsPublishing(false);
    }
  };

  const statusText =
    health === "checking"
      ? "Hub確認中"
      : health === "online"
        ? "Hub接続中"
        : "Hub未接続";

  return (
    <>
      <div className="flex items-center gap-2">
        <span
          className={
            health === "online"
              ? "text-xs text-emerald-300"
              : health === "offline"
                ? "text-xs text-red-300"
                : "text-xs text-gray-400"
          }
        >
          {statusText}
        </span>

        <button
          type="button"
          disabled={!battleJson}
          onClick={() => {
            setMessage(null);
            setIsOpen(true);
          }}
          className="px-4 py-2 rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Battle Hubへ投稿
        </button>
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Battle Hubへ投稿"
        >
          <form
            onSubmit={handlePublish}
            className="w-full max-w-md rounded-lg border border-gray-700 bg-[#111827] p-5 shadow-xl"
          >
            <h2 className="text-lg font-semibold mb-4">Battle Hubへ投稿</h2>

            <label className="block text-sm mb-3">
              <span className="block mb-1 text-gray-300">投稿者名</span>
              <input
                value={authorName}
                onChange={(event) => setAuthorName(event.target.value)}
                maxLength={60}
                required
                className="w-full rounded-md border border-gray-600 bg-[#0b1020] px-3 py-2 outline-none focus:border-violet-400"
                placeholder="Tanku"
              />
            </label>

            <label className="block text-sm mb-4">
              <span className="block mb-1 text-gray-300">説明</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={1000}
                rows={4}
                className="w-full resize-none rounded-md border border-gray-600 bg-[#0b1020] px-3 py-2 outline-none focus:border-violet-400"
                placeholder="このBattleの説明"
              />
            </label>

            {message && (
              <div className="mb-4 rounded border border-gray-700 bg-[#0b1020] p-3 text-xs break-all">
                {message}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={isPublishing}
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 rounded-md bg-gray-600 text-white hover:bg-gray-500 disabled:opacity-40"
              >
                閉じる
              </button>
              <button
                type="submit"
                disabled={!battleJson || !authorName.trim() || isPublishing}
                className="px-4 py-2 rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPublishing ? "投稿中..." : "投稿する"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
