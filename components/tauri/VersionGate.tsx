"use client";

import { useEffect, useState } from "react";
import { isTauriRuntime, desktopVersion } from "@/utils/tauri/bridge";
import { determineUpdate, safeDownloadUrl, type ClientVersion, type UpdateStatus } from "@/utils/version/check";
import { useI18n } from "@/i18n/I18nProvider";

export function VersionGate() {
  const { t } = useI18n();
  const [status, setStatus] = useState<UpdateStatus>("current");
  const [info, setInfo] = useState<ClientVersion | null>(null);
  const [platform, setPlatform] = useState("");
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let active = true;
    desktopVersion().then(result => {
      if (!active) return;
      if (!result.ok || !result.data) throw new Error(result.error ?? "Version check unavailable");
      const response = result.data;
      const status = determineUpdate(response.currentVersion, response.version);
      setInfo(response.version);
      setPlatform(response.platform);
      setStatus(status);
    }).catch(error => {
      if (active) setError(error instanceof Error ? error.message : "Version check unavailable");
    });
    return () => { active = false; };
  }, []);

  if (!isTauriRuntime() || (!error && (status === "current" || dismissed))) return null;
  const required = status === "required";
  const url = info ? safeDownloadUrl(info, platform) : null;
  return (
    <div className={"fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 " + (required ? "" : "pointer-events-none")}>
      <section role="dialog" aria-modal={required} aria-labelledby="version-gate-title"
        className="pointer-events-auto w-full max-w-md rounded-xl border border-gray-600 bg-[#111827] p-6 text-gray-100">
        <h2 id="version-gate-title" className="text-xl font-semibold">
          {required ? t("update.required") : error ? t("update.failed") : t("update.available")}
        </h2>
        <p className="mt-3 text-sm">{error || info?.releaseNotes || t("update.description")}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          {url && <a href={url} target="_blank" rel="noopener noreferrer"
            className="rounded bg-blue-600 px-4 py-2 font-semibold">{t("update.openDownload")}</a>}
          {!required && <button type="button" onClick={() => { setDismissed(true); setError(""); }}
            className="rounded border border-gray-500 px-4 py-2">{t("update.later")}</button>}
          {required && !url && <p role="alert" className="text-sm text-red-300">{t("update.noUrl")}</p>}
        </div>
      </section>
    </div>
  );
}
