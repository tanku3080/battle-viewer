"use client";

import { useI18n } from "@/i18n/I18nProvider";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <label className={"inline-flex items-center gap-2 text-xs " + className}>
      <span className="text-gray-300">{t("language.label")}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as "ja" | "en")}
        aria-label={t("language.label")}
        className="min-h-9 rounded border border-gray-600 bg-[#111827] px-2 text-gray-100"
      >
        <option value="ja">{t("language.ja")}</option>
        <option value="en">{t("language.en")}</option>
      </select>
    </label>
  );
}
