"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DistributedWorksPanel } from "@/components/p2p/DistributedWorksPanel";
import { PublishWorkDialog } from "@/components/p2p/PublishWorkDialog";
import { P2pSettingsPanel } from "@/components/p2p/P2pSettingsPanel";
import { useI18n } from "@/i18n/I18nProvider";
import { isTauriRuntime, desktopP2pStart, desktopP2pStatus } from "@/utils/tauri/bridge";

export default function BattleHubPage() {
  const { t } = useI18n();
  const [publishOpen, setPublishOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [networkError, setNetworkError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const settingsDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    // After explicit terms acceptance and separately persisted native settings,
    // start using the OS-selected IPv4 route. Never start P2P before consent.
    void desktopP2pStatus().then(async (state) => {
      if (!cancelled && state.settings?.participationEnabled && !state.networkActive) {
        try {
          await desktopP2pStart();
        } catch (reason) {
          if (!cancelled) setNetworkError(reason instanceof Error ? reason.message : String(reason));
        }
      }
    }).catch((reason) => {
      if (!cancelled) setNetworkError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const dialog = settingsDialog.current;
    if (settingsOpen && dialog && !dialog.open) dialog.showModal();
    if (!settingsOpen && dialog?.open) dialog.close();
  }, [settingsOpen]);

  return (
    <main className="min-h-dvh bg-[#050816] p-4 text-gray-100 sm:p-6">
      <header className="mx-auto mb-6 flex max-w-5xl flex-wrap items-center gap-3 sm:mb-8">
        <Link href="/home" className="rounded-md bg-gray-700 px-4 py-2 hover:bg-gray-600">{t("hub.back")}</Link>
        <div>
          <h1 className="text-2xl font-semibold">{t("hub.title")}</h1>
          <p className="text-sm text-gray-400">{t("hub.description")}</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {isTauriRuntime() && <button type="button" onClick={() => setPublishOpen(true)}
            className="min-h-11 rounded-md bg-blue-600 px-5 py-2 font-semibold hover:bg-blue-700">{t("publish.submit")}</button>}
          <button type="button" onClick={() => setSettingsOpen(true)}
            className="min-h-11 rounded-md border border-gray-600 bg-gray-800 px-5 py-2 font-semibold hover:bg-gray-700">
            {t("hub.settings")}
          </button>
        </div>
      </header>
      <section className="mx-auto max-w-5xl">
        {networkError && <p role="alert" className="mb-4 rounded border border-amber-700 p-3 text-amber-200">
          {t("hub.networkWarning")}: {networkError}
        </p>}
        <DistributedWorksPanel key={refreshKey} />
        <PublishWorkDialog open={publishOpen} onClose={() => setPublishOpen(false)}
          onPublished={(work) => {
            setNotice(t("p2p.published", { title: work.title }));
            setRefreshKey((n) => n + 1);
          }} />
        <dialog ref={settingsDialog} aria-labelledby="hub-settings-title"
          onCancel={(event) => { event.preventDefault(); setSettingsOpen(false); }}
          className="m-auto max-h-[calc(100dvh-2rem)] w-[min(95vw,55rem)] overflow-y-auto rounded-xl border border-gray-700 bg-[#0b1020] p-5 text-gray-100 shadow-2xl backdrop:bg-black/80">
          <header className="flex items-center justify-between gap-2">
            <h2 id="hub-settings-title" className="text-xl font-semibold">{t("hub.settings")}</h2>
            <button type="button" onClick={() => setSettingsOpen(false)}
              className="min-h-11 rounded bg-gray-700 px-4">{t("publish.close")}</button>
          </header>
          {settingsOpen && <P2pSettingsPanel />}
        </dialog>
        {notice && <div role="status" aria-live="polite"
          className="fixed bottom-5 right-5 z-50 max-w-sm rounded-lg border border-emerald-700 bg-[#0b1020] p-4 text-emerald-200 shadow-xl">
          {notice}<button type="button" onClick={() => setNotice("")} className="ml-3 rounded px-2" aria-label={t("hubPublish.dismiss")}>×</button>
        </div>}
      </section>
    </main>
  );
}
