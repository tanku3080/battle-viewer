"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { RawBattleJson } from "@/utils/battle/loadBattleJson";
import { getBattleHubHealth, publishBattleToHub } from "@/utils/battleHub/client";
import { BattleHubAccessButton } from "@/components/battleHub/BattleHubAccessButton";
import { useI18n } from "@/i18n/I18nProvider";
import { hasAcceptedHubTerms } from "@/utils/battleHub/terms";

type Props = { battleJson: RawBattleJson | null };
type HealthState = "checking" | "online" | "offline";

export function BattleHubControls({ battleJson }: Props) {
  const { t } = useI18n();
  const [health, setHealth] = useState<HealthState>("checking");
  const [isOpen, setIsOpen] = useState(false);
  const [desktopPanelOpen, setDesktopPanelOpen] = useState(false);
  const [authorName, setAuthorName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    if (!hasAcceptedHubTerms()) { setHealth("offline"); return () => controller.abort(); }
    getBattleHubHealth(controller.signal)
      .then((result) => setHealth(result.status === "ok" ? "online" : "offline"))
      .catch(() => {
        if (!controller.signal.aborted) setHealth("offline");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
      previousFocus?.focus();
    };
  }, [isOpen]);

  const handlePublish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!battleJson || !authorName.trim() || !hasAcceptedHubTerms()) return;

    setIsPublishing(true);
    setMessage(null);

    try {
      const result = await publishBattleToHub({
        authorName: authorName.trim(),
        description: description.trim(),
        battleJson,
      });
      setHealth("online");
      setIsOpen(false);
      setToast(t("publish.success", { title: result.title, id: result.id }));
    } catch (error) {
      const failure = error instanceof Error ? error.message : t("publish.failed");
      setMessage(failure.includes("Duplicate battle") || failure.includes("409")
        ? t("hubPublish.duplicate") : failure);
    } finally {
      setIsPublishing(false);
    }
  };

  const statusText =
    health === "checking"
      ? t("publish.statusChecking")
      : health === "online"
        ? t("publish.statusOnline")
        : t("publish.statusOffline");

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {statusText}
        </span>

        <button
          type="button"
          disabled={!battleJson || health !== "online"}
          onClick={() => {
            setMessage(null);
            setIsOpen(true);
          }}
          className="min-h-11 rounded-md bg-violet-600 px-4 py-2 text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("publish.open")}
        </button>

        <div className="relative hidden lg:block">
          <button
            type="button"
            aria-expanded={desktopPanelOpen}
            aria-controls="battle-hub-desktop-panel"
            aria-label={desktopPanelOpen ? t("hubAccess.panelClose") : t("hubAccess.panelOpen")}
            onClick={() => setDesktopPanelOpen((value) => !value)}
            className="min-h-11 rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700"
          >
            {desktopPanelOpen ? "Battle Hub ◀" : "Battle Hub ▶"}
          </button>

          {desktopPanelOpen && (
            <aside
              id="battle-hub-desktop-panel"
              className="absolute right-0 top-full z-40 mt-2 min-w-64 rounded-lg border border-gray-700 bg-[#111827] p-3 shadow-xl"
            >
              <div
                className={
                  "mb-2 text-xs " +
                  (health === "online"
                    ? "text-emerald-300"
                    : health === "offline"
                      ? "text-red-300"
                      : "text-gray-400")
                }
              >
                {statusText}
              </div>
              <BattleHubAccessButton className="w-full" />
            </aside>
          )}
        </div>
      </div>

      {toast && <div role="status" aria-live="polite"
        className="fixed bottom-5 right-5 z-50 max-w-sm rounded-lg border border-emerald-700 bg-[#0b1020] p-4 text-emerald-200 shadow-xl">
        {toast}<button type="button" aria-label={t("hubPublish.dismiss")} onClick={() => setToast(null)} className="ml-3 rounded px-2">×</button>
      </div>}
      {isOpen && (
        <dialog
          ref={dialogRef}
          aria-labelledby="battle-hub-publish-title"
          onCancel={(event) => {
            event.preventDefault();
            if (!isPublishing) setIsOpen(false);
          }}
          className="m-auto max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] overflow-auto rounded-lg border border-gray-700 bg-[#111827] p-0 text-gray-100 shadow-xl backdrop:bg-black/70"
        >
          <form onSubmit={handlePublish} className="w-full p-5">
            <h2 id="battle-hub-publish-title" className="mb-4 text-lg font-semibold">
              {t("publish.title")}
            </h2>

            <label className="mb-3 block text-sm">
              <span className="mb-1 block text-gray-300">{t("publish.author")}</span>
              <input
                value={authorName}
                onChange={(event) => setAuthorName(event.target.value)}
                maxLength={60}
                required
                className="w-full rounded-md border border-gray-600 bg-[#0b1020] px-3 py-2 outline-none focus:border-violet-400"
                placeholder="Tanku"
              />
            </label>

            <label className="mb-4 block text-sm">
              <span className="mb-1 block text-gray-300">{t("publish.description")}</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={1000}
                rows={4}
                className="w-full resize-none rounded-md border border-gray-600 bg-[#0b1020] px-3 py-2 outline-none focus:border-violet-400"
                placeholder={t("publish.descriptionPlaceholder")}
              />
            </label>

            {message && (
              <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="mb-4 break-all rounded border border-gray-700 bg-[#0b1020] p-3 text-xs"
              >
                {message}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={isPublishing}
                onClick={() => setIsOpen(false)}
                className="rounded-md bg-gray-600 px-4 py-2 text-white hover:bg-gray-500 disabled:opacity-40"
              >
                {t("publish.close")}
              </button>
              <button
                type="submit"
                disabled={!battleJson || !authorName.trim() || isPublishing}
                className="rounded-md bg-violet-600 px-4 py-2 text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isPublishing ? t("publish.submitting") : t("publish.submit")}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
