"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/I18nProvider";

export function BattleHubAccessButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <button type="button" onClick={() => router.push("/hub")}
      className={"min-h-11 rounded-md bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 " + className}
      aria-label={t("hubAccess.openTitle")}>
      {t("hubAccess.access")}
    </button>
  );
}
