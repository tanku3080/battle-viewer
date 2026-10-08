"use client";

import { useI18n } from "@/i18n/I18nProvider";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  const buttonClass = (value: "ja" | "en") =>
    "min-h-9 rounded-md px-3 text-sm font-medium transition-colors " +
    (locale === value
      ? "bg-blue-600 text-white shadow-sm"
      : "text-gray-300 hover:bg-gray-700 hover:text-white");

  return (
    <div
      className={
        "inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-[#111827] p-1 shadow-sm " +
        className
      }
    >
      <span className="px-2 text-xs text-gray-400">{t("language.label")}</span>
      <div
        role="group"
        aria-label={t("language.label")}
        className="inline-flex rounded-md bg-[#0b1020] p-1"
      >
        <button
          type="button"
          aria-pressed={locale === "ja"}
          className={buttonClass("ja")}
          onClick={() => setLocale("ja")}
        >
          {t("language.ja")}
        </button>
        <button
          type="button"
          aria-pressed={locale === "en"}
          className={buttonClass("en")}
          onClick={() => setLocale("en")}
        >
          {t("language.en")}
        </button>
      </div>
    </div>
  );
}
