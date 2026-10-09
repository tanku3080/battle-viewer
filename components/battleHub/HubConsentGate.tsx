"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/I18nProvider";
import { desktopP2pStatus, desktopP2pUpdateSettings, isTauriRuntime } from "@/utils/tauri/bridge";
import { acceptHubTerms, hasAcceptedHubTerms } from "@/utils/battleHub/terms";

function subscribeConsent(callback: () => void) {
  window.addEventListener("battle-viewer:hub-terms-accepted", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("battle-viewer:hub-terms-accepted", callback);
    window.removeEventListener("storage", callback);
  };
}

export function HubConsentGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const accepted = useSyncExternalStore(subscribeConsent, hasAcceptedHubTerms, () => false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (accepted) return;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, [accepted]);

  const decline = () => {
    setChecked(false);
    router.replace("/home");
  };
  const agree = async () => {
    if (!checked || busy) return;
    setBusy(true);
    setError("");
    try {
      // Opt-in is explicit. Existing independent user choices are not overwritten.
      if (isTauriRuntime()) {
        const state = await desktopP2pStatus();
        if (state.settings && !localStorage.getItem("battle-viewer:p2p-terms-initialized")) {
          await desktopP2pUpdateSettings({
            participationEnabled: true,
            downloadsEnabled: true,
            redistributionEnabled: true,
            cacheQuotaBytes: state.settings.cacheQuotaBytes,
            uploadLimitBytesPerSecond: state.settings.uploadLimitBytesPerSecond,
          });
          localStorage.setItem("battle-viewer:p2p-terms-initialized", "yes");
        }
      }
      acceptHubTerms();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  if (accepted) return <>{children}</>;

  return (
    <main className="min-h-dvh bg-[#050816]">
      <dialog ref={dialogRef} aria-labelledby="hub-terms-title"
        onCancel={(event) => { event.preventDefault(); decline(); }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(38rem,calc(100vw-2rem))] overflow-auto rounded-lg border border-gray-600 bg-[#111827] p-0 text-gray-100 shadow-xl backdrop:bg-black/80">
        <section className="space-y-4 p-6">
          <h1 id="hub-terms-title" className="text-xl font-semibold">{t("hubTerms.title")}</h1>
          <p className="text-sm leading-6 text-gray-300">{t("hubTerms.intro")}</p>
          <div className="max-h-60 space-y-3 overflow-y-auto rounded-lg border border-gray-700 bg-[#0b1020] p-4 text-sm leading-6">
            <p>{t("hubTerms.metadata")}</p>
            <p>{t("hubTerms.p2p")}</p>
            <p>{t("hubTerms.privacy")}</p>
            <p>{t("hubTerms.optional")}</p>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)}
              className="h-5 w-5 shrink-0" />
            <span>{t("hubTerms.checkbox")}</span>
          </label>
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={decline} className="min-h-11 rounded-md bg-gray-700 px-5">
              {t("hubTerms.no")}
            </button>
            <button type="button" disabled={!checked || busy} onClick={() => void agree()}
              className="min-h-11 rounded-md bg-emerald-700 px-5 disabled:cursor-not-allowed disabled:opacity-40">
              {t("hubTerms.ok")}
            </button>
          </div>
        </section>
      </dialog>
    </main>
  );
}
