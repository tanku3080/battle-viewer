"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getBattleHubBattles,
  type BattleHubBattleSummary,
} from "@/utils/battleHub/client";

export default function BattleHubPage() {
  const [battles, setBattles] = useState<BattleHubBattleSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBattleHubBattles()
      .then((result) => {
        setBattles(result);
        setError(null);
      })
      .catch((reason) => {
        setError(
          reason instanceof Error
            ? reason.message
            : "Battle Hubの取得に失敗しました"
        );
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-[#050816] text-gray-100 p-6">
      <header className="max-w-5xl mx-auto flex items-center gap-3 mb-8">
        <Link
          href="/home"
          className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600"
        >
          ホームへ戻る
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">Battle Hub</h1>
          <p className="text-sm text-gray-400">
            現在Battle Hubへ投稿されているBattle一覧
          </p>
        </div>
      </header>

      <section className="max-w-5xl mx-auto">
        {loading && <p className="text-gray-400">読み込み中...</p>}

        {error && (
          <div className="rounded border border-red-800 bg-red-950 p-4 text-red-200">
            {error}
          </div>
        )}

        {!loading && !error && battles.length === 0 && (
          <div className="rounded border border-gray-700 bg-[#111827] p-6 text-gray-400">
            投稿済みBattleはまだありません。
          </div>
        )}

        <div className="grid gap-3">
          {battles.map((battle) => (
            <article
              key={battle.id}
              className="rounded-lg border border-gray-700 bg-[#111827] p-4"
            >
              <h2 className="font-semibold text-lg">{battle.title}</h2>
              <div className="mt-1 text-sm text-gray-400">
                投稿者: {battle.authorName}
              </div>
              {battle.description && (
                <p className="mt-3 text-sm text-gray-300">
                  {battle.description}
                </p>
              )}
              <div className="mt-3 text-xs text-gray-500">
                {new Date(battle.createdAt).toLocaleString()}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
