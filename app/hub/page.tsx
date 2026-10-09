"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getBattleHubBattles, downloadLegacyBattle, type BattleHubBattleSummary } from "@/utils/battleHub/client";
import { useI18n } from "@/i18n/I18nProvider";
import { DistributedWorksPanel } from "@/components/p2p/DistributedWorksPanel";
import { PublishWorkDialog } from "@/components/p2p/PublishWorkDialog";
import { isTauriRuntime } from "@/utils/tauri/bridge";

export default function BattleHubPage() {
  const { locale, t } = useI18n();
  const [battles, setBattles] = useState<BattleHubBattleSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishOpen, setPublishOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [downloading, setDownloading] = useState<string | null>(null);

  async function downloadLegacy(id: string, title: string) {
    setDownloading(id);
    setError(null);
    try {
      const json = await downloadLegacyBattle(id);
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = (title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "battle") + ".json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setDownloading(null); }
  }

  useEffect(() => {
    getBattleHubBattles()
      .then((result) => { setBattles(result); setError(null); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : t("hub.error")))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <main className="min-h-dvh bg-[#050816] p-4 text-gray-100 sm:p-6">
      <header className="mx-auto mb-6 flex max-w-5xl flex-wrap items-center gap-3 sm:mb-8">
        <Link href="/home" className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600">{t("hub.back")}</Link>
        <div>
          <h1 className="text-2xl font-semibold">{t("hub.title")}</h1>
          <p className="text-sm text-gray-400">{t("hub.description")}</p>
        </div>
        {isTauriRuntime() && <button type="button" onClick={() => setPublishOpen(true)}
          className="ml-auto min-h-11 rounded-md bg-blue-600 px-5 py-2 font-semibold hover:bg-blue-700">{t("publish.submit")}</button>}
      </header>

      <section className="mx-auto max-w-5xl">
        {loading && <p role="status" aria-live="polite" className="text-gray-300">{t("common.loading")}</p>}
        {error && <div role="alert" className="rounded border border-red-800 bg-red-950 p-4 text-red-200">{error}</div>}
        {!loading && !error && battles.length === 0 && <div className="rounded border border-gray-700 bg-[#111827] p-6 text-gray-400">{t("hub.empty")}</div>}

        <div className="grid gap-3">
          {battles.map((battle) => (
            <article key={battle.id} className="rounded-lg border border-gray-700 bg-[#111827] p-4">
              <h2 className="font-semibold text-lg">{battle.title}</h2>
              <div className="mt-1 text-sm text-gray-400">{t("hub.author", { name: battle.authorName })}</div>
              {battle.description && <p className="mt-3 text-sm text-gray-300">{battle.description}</p>}
              <div className="mt-3 text-xs text-gray-500">{new Date(battle.createdAt).toLocaleString(locale === "ja" ? "ja-JP" : "en-US")}</div>
              <button type="button" disabled={downloading === battle.id} onClick={() => void downloadLegacy(battle.id, battle.title)}
                className="mt-3 min-h-11 rounded bg-gray-700 px-4 hover:bg-gray-600 disabled:opacity-40">{t("hubPublish.download")}</button>
            </article>
          ))}
        </div>
        <DistributedWorksPanel key={refreshKey} />
        <PublishWorkDialog open={publishOpen} onClose={() => setPublishOpen(false)}
          onPublished={(work) => {
            setNotice(t("p2p.published", { title: work.title }));
            setRefreshKey((n) => n + 1);
          }} />
        {notice && <div role="status" aria-live="polite"
          className="fixed bottom-5 right-5 z-50 max-w-sm rounded-lg border border-emerald-700 bg-[#0b1020] p-4 text-emerald-200 shadow-xl">{notice}<button type="button" className="ml-3 rounded px-2" onClick={() => setNotice("")} aria-label={t("hubPublish.dismiss")}>×</button></div>}
      </section>
    </main>
  );
}
