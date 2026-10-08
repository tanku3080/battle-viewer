"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import ja from "@/i18n/locales/ja.json";
import en from "@/i18n/locales/en.json";

export type Locale = "ja" | "en";
export type MessageKey = keyof typeof ja;
type Params = Record<string, string | number>;

const messages = { ja, en } as const;
const STORAGE_KEY = "battle-viewer:locale";

function format(template: string, params?: Params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    params[key] === undefined ? match : String(params[key])
  );
}

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: Params) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ja");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const detected: Locale = saved === "ja" || saved === "en"
      ? saved
      : navigator.language.toLowerCase().startsWith("ja")
        ? "ja"
        : "en";
    setLocaleState(detected);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLocaleState(next);
  }, []);

  const t = useCallback((key: MessageKey, params?: Params) => {
    const template = messages[locale][key] ?? messages.en[key] ?? key;
    return format(template, params);
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
