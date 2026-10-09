"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import {
  desktopP2pInventory,
  desktopP2pStart,
  desktopP2pStop,
  desktopP2pStatus,
  desktopP2pUpdateSettings,
  isTauriRuntime,
  type P2pInventory,
  type P2pSettings,
  type P2pStatus,
} from "@/utils/tauri/bridge";

const MIB = 1024 * 1024;
const KIB = 1024;
const MIN_UPLOAD_KIB = 16;
const MAX_UPLOAD_KIB = 64 * 1024;
const MAX_CACHE_MIB = 64 * 1024;
const subscribeRuntime = () => () => {};

function bytesLabel(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
  }
  if (bytes >= MIB) return `${(bytes / MIB).toFixed(1)} MiB`;
  if (bytes >= KIB) return `${(bytes / KIB).toFixed(1)} KiB`;
  return `${Math.round(bytes)} B`;
}

export function P2pSettingsPanel() {
  const { t } = useI18n();
  const desktop = useSyncExternalStore(
    subscribeRuntime,
    isTauriRuntime,
    () => false
  );
  const [status, setStatus] = useState<P2pStatus | null>(null);
  const [inventory, setInventory] = useState<P2pInventory | null>(null);
  const [draft, setDraft] = useState<P2pSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advertisedIp, setAdvertisedIp] = useState("");
  const [networkBusy, setNetworkBusy] = useState(false);
  const [networkAddress, setNetworkAddress] = useState("");

  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;

    desktopP2pStatus()
      .then((next) => {
        if (cancelled) return;
        setStatus(next);
        setDraft(next.settings ?? null);
        setError(next.initializationError ?? null);
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [desktop]);

  const updateDraft = (patch: Partial<P2pSettings>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setMessage(null);
    setError(null);
  };

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const next = await desktopP2pUpdateSettings({
        participationEnabled: draft.participationEnabled,
        downloadsEnabled: draft.downloadsEnabled,
        redistributionEnabled: draft.redistributionEnabled,
        cacheQuotaBytes: draft.cacheQuotaBytes,
        uploadLimitBytesPerSecond: draft.uploadLimitBytesPerSecond,
      });
      setStatus(next);
      setDraft(next.settings ?? null);
      setMessage(t("p2p.saved"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  const toggleNetwork = async () => {
    if (networkBusy) return;
    setNetworkBusy(true); setError(null); setMessage(null);
    try {
      if (status?.networkActive) {
        await desktopP2pStop();
        setNetworkAddress("");
      } else {
        const result = await desktopP2pStart(advertisedIp.trim());
        setNetworkAddress(result.address);
      }
      setStatus(await desktopP2pStatus());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setNetworkBusy(false); }
  };

  const refreshInventory = async () => {
    if (inventoryLoading) return;
    setInventoryLoading(true);
    setError(null);
    try {
      setInventory(await desktopP2pInventory());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setInventoryLoading(false);
    }
  };

  if (!desktop) {
    return (
      <section
        aria-labelledby="p2p-settings-title"
        className="w-full rounded-xl border border-gray-700 bg-[#111827] p-4 text-left sm:p-5"
      >
        <h2 id="p2p-settings-title" className="text-lg font-semibold">
          {t("p2p.title")}
        </h2>
        <p className="mt-2 text-sm leading-6 text-gray-300">
          {t("p2p.webOnly")}
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="p2p-settings-title"
      className="w-full rounded-xl border border-gray-700 bg-[#111827] p-4 text-left sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="p2p-settings-title" className="text-lg font-semibold">
            {t("p2p.title")}
          </h2>
          <p className="mt-1 text-sm text-gray-400">{t("p2p.networkDescription")}</p>
        </div>
        {status?.identity?.installationId && (
          <div className="max-w-full text-right text-xs text-gray-400">
            <div>{t("p2p.installationId")}</div>
            <code className="break-all text-gray-200">
              {status.identity.installationId}
            </code>
            <div className="mt-2">{t("p2p.peerId")}</div>
            <code className="break-all text-gray-200">
              {status.identity.peerId}
            </code>
          </div>
        )}
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-gray-300" role="status">
          {t("p2p.loading")}
        </p>
      ) : !status?.available || !draft ? (
        <div className="mt-4 rounded-md border border-red-800 bg-red-950 p-3 text-sm text-red-200" role="alert">
          {error || status?.initializationError || t("p2p.unavailable")}
        </div>
      ) : (
        <>
          <div className="mt-4 rounded-md border border-amber-700 bg-amber-950/50 p-3 text-sm leading-6 text-amber-100">
            <p>{t("p2p.privacyIp")}</p>
            <p>{t("p2p.privacyDisk")}</p>
            <p>{t("p2p.privacyUpload")}</p>
          </div>

          <fieldset className="mt-4 space-y-3">
            <legend className="sr-only">{t("p2p.consentLegend")}</legend>

            <label className="flex min-h-11 items-start gap-3 rounded-md border border-gray-700 p-3">
              <input
                type="checkbox"
                checked={draft.participationEnabled}
                onChange={(event) =>
                  updateDraft({ participationEnabled: event.target.checked })
                }
                className="mt-1 h-5 w-5 shrink-0"
              />
              <span>
                <span className="block font-medium">{t("p2p.participation")}</span>
                <span className="block text-xs leading-5 text-gray-400">
                  {t("p2p.participationHelp")}
                </span>
              </span>
            </label>

            <label className="flex min-h-11 items-start gap-3 rounded-md border border-gray-700 p-3">
              <input
                type="checkbox"
                checked={draft.downloadsEnabled}
                onChange={(event) =>
                  updateDraft({ downloadsEnabled: event.target.checked })
                }
                className="mt-1 h-5 w-5 shrink-0"
              />
              <span>
                <span className="block font-medium">{t("p2p.download")}</span>
                <span className="block text-xs leading-5 text-gray-400">
                  {t("p2p.downloadHelp")}
                </span>
              </span>
            </label>

            <label className="flex min-h-11 items-start gap-3 rounded-md border border-gray-700 p-3">
              <input
                type="checkbox"
                checked={draft.redistributionEnabled}
                onChange={(event) =>
                  updateDraft({ redistributionEnabled: event.target.checked })
                }
                className="mt-1 h-5 w-5 shrink-0"
              />
              <span>
                <span className="block font-medium">{t("p2p.redistribution")}</span>
                <span className="block text-xs leading-5 text-gray-400">
                  {t("p2p.redistributionHelp")}
                </span>
              </span>
            </label>
          </fieldset>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-gray-300">{t("p2p.cacheQuota")}</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={MAX_CACHE_MIB}
                  step={64}
                  value={Math.round(draft.cacheQuotaBytes / MIB)}
                  onChange={(event) =>
                    updateDraft({
                      cacheQuotaBytes: Math.max(
                        0,
                        Math.min(MAX_CACHE_MIB, Number(event.target.value) || 0)
                      ) * MIB,
                    })
                  }
                  className="min-h-11 min-w-0 flex-1 rounded border border-gray-600 bg-[#0b1020] px-3 py-2"
                />
                <span className="text-xs text-gray-400">MiB</span>
              </div>
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-gray-300">{t("p2p.uploadLimit")}</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={MIN_UPLOAD_KIB}
                  max={MAX_UPLOAD_KIB}
                  step={16}
                  value={Math.round(draft.uploadLimitBytesPerSecond / KIB)}
                  onChange={(event) =>
                    updateDraft({
                      uploadLimitBytesPerSecond:
                        Math.max(
                          MIN_UPLOAD_KIB,
                          Math.min(
                            MAX_UPLOAD_KIB,
                            Number(event.target.value) || MIN_UPLOAD_KIB
                          )
                        ) * KIB,
                    })
                  }
                  className="min-h-11 min-w-0 flex-1 rounded border border-gray-600 bg-[#0b1020] px-3 py-2"
                />
                <span className="text-xs text-gray-400">KiB/s</span>
              </div>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-gray-300">
            <span>
              {t("p2p.cacheUsed")}: {bytesLabel(status.cacheUsedBytes ?? 0)}
            </span>
            <span>
              {t("p2p.networkState")}: {status.networkActive ? t("p2p.networkRunning") : t("p2p.networkInactive")}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1 text-sm">
              {t("p2p.manualAddress")}
              <input type="text" value={advertisedIp}
                onChange={(event) => setAdvertisedIp(event.target.value)}
                disabled={status.networkActive || networkBusy}
                className="mt-1 min-h-11 w-full rounded border border-gray-600 bg-[#0b1020] px-3"
                placeholder={t("p2p.autoAddress")} />
            </label>
            <button type="button" onClick={() => void toggleNetwork()}
              disabled={networkBusy || (!status.networkActive && !status.settings?.participationEnabled)}
              className="min-h-11 rounded bg-blue-700 px-4 disabled:opacity-40">
              {status.networkActive ? t("p2p.stopNetwork") : t("p2p.startNetwork")}
            </button>
          </div>
          <p className="mt-2 break-all text-xs text-gray-400">
            {t("p2p.ipHelp")} {networkAddress}
          </p>

          {inventory && (
            <div className="mt-3 rounded-md border border-gray-700 bg-[#0b1020] p-3 text-sm">
              <div>
                {t("p2p.cacheEntries", { count: inventory.entries.length })}
              </div>
              <div>
                {t("p2p.cacheCorrupt", {
                  count: inventory.corruptHashes.length,
                })}
              </div>
              <div>
                {t("p2p.cacheVerifiedBytes", {
                  size: bytesLabel(inventory.usedBytes),
                })}
              </div>
            </div>
          )}

          {(message || error) && (
            <p
              role={error ? "alert" : "status"}
              aria-live="polite"
              className={
                "mt-4 text-sm " + (error ? "text-red-300" : "text-emerald-300")
              }
            >
              {error || message}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="min-h-11 rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? t("p2p.saving") : t("p2p.save")}
            </button>
            <button
              type="button"
              disabled={inventoryLoading}
              onClick={() => void refreshInventory()}
              className="min-h-11 rounded-md bg-gray-700 px-4 py-2 text-white hover:bg-gray-600 disabled:opacity-50"
            >
              {inventoryLoading ? t("p2p.checkingCache") : t("p2p.checkCache")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
