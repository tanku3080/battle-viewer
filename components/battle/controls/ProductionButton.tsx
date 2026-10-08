"use client";

import { useI18n } from "@/i18n/I18nProvider";

type Props = { disabled?: boolean; onStart: () => void };

export function ProductionButton({ disabled, onStart }: Props) {
  const { t } = useI18n();
  return (
    <button className="min-h-11 px-2.5 py-2 text-sm rounded-md bg-purple-600 text-white disabled:bg-purple-900 sm:ml-1" disabled={disabled} onClick={onStart}>
      {t("production.start")}
    </button>
  );
}
