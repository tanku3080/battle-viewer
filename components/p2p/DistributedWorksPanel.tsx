import { stageDistributedJson } from "@/utils/battleHub/pendingTransfer";
"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  isTauriRuntime, desktopP2pStatus, type P2pStatus
} from "@/utils/tauri/bridge";
import {
  listDistributedWorks, publishDistributedWork, fetchDistributedWork,
  type DistributedWork,
} from "@/utils/battleHub/works";
import { useI18n } from "@/i18n/I18nProvider";

export function DistributedWorksPanel() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [works, setWorks] = useState<DistributedWork[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<P2pStatus | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = async (q = query) => {
    setLoading(true);
    setError("");
    try {
      const results = await listDistributedWorks(q);
      setWorks(results.items);
      if (isTauriRuntime()) setStatus(await desktopP2pStatus());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listDistributedWorks(""),
      isTauriRuntime() ? desktopP2pStatus() : Promise.resolve(null),
    ])
      .then(([catalog, desktop]) => {
        if (!cancelled) { setWorks(catalog.items); setStatus(desktop); }
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const publish = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (file.size > 32 * 1024 * 1024) throw new Error(t("p2p.fileTooLarge"));
      const work = await publishDistributedWork(await file.text());
      setNotice(t("p2p.published", { title: work.title }));
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setBusy(false); }
  };

  const open = async (work: DistributedWork, destination: "battle" | "create") => {
    setBusy(true); setError(""); setNotice("");
    try {
      // The desktop returns exactly the verified original UTF-8 bytes.
      const raw = await fetchDistributedWork(work);
      // Keep the original string; do not serialize derived Viewer data.
      stageDistributedJson(raw);
      router.push(destination === "battle" ? "/battle" : "/create");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setBusy(false); }
  };

  const desktop = isTauriRuntime();
  const canPublish = desktop && status?.networkActive &&
    status.settings?.participationEnabled && status.settings.redistributionEnabled;
  const canDownload = desktop && status?.networkActive &&
    status.settings?.participationEnabled && status.settings.downloadsEnabled;

  return (
    <section className="mt-8" aria-labelledby="distributed-works-title">
      <h2 id="distributed-works-title" className="text-xl font-semibold">{t("p2p.catalogTitle")}</h2>
      <p className="mt-2 text-sm text-gray-400">{t("p2p.catalogDescription")}</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <form className="flex min-w-0 flex-1 gap-2" onSubmit={(event) => {
          event.preventDefault(); void refresh(query);
        }}>
          <label className="min-w-0 flex-1 text-sm">
            {t("p2p.searchWorks")}
            <input value={query} onChange={(event) => setQuery(event.target.value.slice(0, 200))}
              className="mt-1 min-h-11 w-full rounded-md border border-gray-600 bg-[#0b1020] px-3"
              maxLength={200} />
          </label>
          <button className="min-h-11 self-end rounded bg-gray-700 px-4" type="submit">
            {t("p2p.search")}
          </button>
        </form>
        {desktop && (
          <label className={"inline-flex min-h-11 cursor-pointer items-center rounded px-4 " +
            (canPublish ? "bg-blue-600" : "bg-gray-700 text-gray-400")}>
            {t("p2p.publishWork")}
            <input type="file" accept="application/json,.json" className="sr-only"
              disabled={!canPublish || busy} onChange={publish} />
          </label>
        )}
      </div>
      {!desktop && <p className="mt-3 text-sm text-amber-200">{t("p2p.webOnly")}</p>}
      {desktop && !status?.networkActive &&
        <p className="mt-3 text-sm text-amber-200">{t("p2p.startFirst")}</p>}
      {error && <p className="mt-3 text-red-300" role="alert">{error}</p>}
      {notice && <p className="mt-3 text-green-300" role="status">{notice}</p>}
      {loading && <p role="status" className="mt-4">{t("common.loading")}</p>}
      {!loading && works.length === 0 && <p className="mt-4 text-gray-400">{t("hub.empty")}</p>}
      <div className="mt-4 grid gap-3">
        {works.map((work) => (
          <article key={work.id} className="rounded-lg border border-gray-700 bg-[#111827] p-4">
            <h3 className="font-semibold">{work.title}</h3>
            <div className="mt-1 text-sm text-gray-400">
              {t("hub.author", { name: work.authorName })} ·
              {" "}{new Date(work.createdAt).toLocaleString(locale === "ja" ? "ja-JP" : "en-US")}
            </div>
            {work.description && <p className="mt-2 text-sm">{work.description}</p>}
            <div className="mt-2 text-xs text-gray-400">
              {t("p2p.replicaCount", { count: work.onlineReplicaCount, target: work.targetReplicas })}
              {" · "}{work.downloadStatus}
            </div>
            {desktop && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={!canDownload || busy || !work.downloadable}
                  className="min-h-11 rounded bg-blue-700 px-4 py-2 disabled:opacity-40"
                  onClick={() => void open(work, "battle")}>{t("p2p.openViewer")}</button>
                <button type="button" disabled={!canDownload || busy || !work.downloadable}
                  className="min-h-11 rounded bg-gray-700 px-4 py-2 disabled:opacity-40"
                  onClick={() => void open(work, "create")}>{t("p2p.openCreator")}</button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
