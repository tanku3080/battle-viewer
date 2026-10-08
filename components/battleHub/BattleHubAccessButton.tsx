"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBattleHubHealth } from "@/utils/battleHub/client";
import { useI18n } from "@/i18n/I18nProvider";

type HealthState = "checking" | "online" | "offline";

export function BattleHubAccessButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [health, setHealth] = useState<HealthState>("checking");

  useEffect(() => {
    const controller = new AbortController();
    getBattleHubHealth(controller.signal)
      .then((result) => setHealth(result.status === "ok" ? "online" : "offline"))
      .catch(() => { if (!controller.signal.aborted) setHealth("offline"); });
    return () => controller.abort();
  }, []);

  const enabled = health === "online";

  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={() => router.push("/hub")}
      className={"min-h-11 px-4 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed " + className}
      title={health === "checking" ? t("hubAccess.checkingTitle") : enabled ? t("hubAccess.openTitle") : t("hubAccess.offlineTitle")}
    >
      {health === "checking" ? t("hubAccess.checking") : t("hubAccess.access")}
    </button>
  );
}
