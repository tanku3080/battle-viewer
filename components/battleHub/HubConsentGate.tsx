"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/I18nProvider";
import { acceptHubTerms, hasAcceptedHubTerms } from "@/utils/battleHub/terms";

export function HubConsentGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [accepted, setAccepted] = useState(false);
  const [ready, setReady] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const consent = hasAcceptedHubTerms();
    setAccepted(consent);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || accepted) return;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, [ready, accepted]);

  const decline = () => {
    setChecked(false);
    router.replace("/home");
  };
  const agree = () => {
    if (!checked) return;
    try {
      acceptHubTerms();
      setAccepted(true);
    } catch {
      // Storage unavailable: do not allow network access without persisted consent.
    }
  };

  if (!ready) return <main className="min-h-dvh bg-[#050816]" />;
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
          <div className="flex justify-end gap-3">
            <button type="button" onClick={decline} className="min-h-11 rounded-md bg-gray-700 px-5">
              {t("hubTerms.no")}
            </button>
            <button type="button" disabled={!checked} onClick={agree}
              className="min-h-11 rounded-md bg-emerald-700 px-5 disabled:cursor-not-allowed disabled:opacity-40">
              {t("hubTerms.ok")}
            </button>
          </div>
        </section>
      </dialog>
    </main>
  );
}
