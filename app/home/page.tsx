"use client";

import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { BattleHubAccessButton } from "@/components/battleHub/BattleHubAccessButton";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/i18n/I18nProvider";

export default function HomePage() {
  const { t } = useI18n();
  return (
    <main className="min-h-dvh bg-[#0b1020] px-4 py-6 text-[#f5f5f5] sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-5xl flex-col"><header className="w-full pt-2 sm:pt-4">
        <div className="mb-6 flex flex-wrap items-center justify-end gap-3 sm:mb-8">
          <LanguageSwitcher />
          <LogoutButton />
        </div>
        <div className="text-center">
          <h1 className="mb-2 text-3xl font-semibold sm:text-4xl">{t("home.title")}</h1>
          <p className="opacity-70">{t("home.subtitle")}</p>
        </div>
      </header>

      <section className="my-auto grid w-full gap-4 text-center sm:mx-auto sm:max-w-md">
        <Link href="/battle" className="px-8 py-3 bg-blue-600 rounded-lg text-white font-semibold hover:bg-blue-700">{t("home.view")}</Link>
        <Link href="/create" className="px-8 py-3 bg-violet-600 rounded-lg text-white font-semibold hover:bg-violet-700">{t("home.create")}</Link>
        <BattleHubAccessButton className="px-8 py-3 font-semibold" />
      </section>

      <footer className="mt-8 text-center text-xs opacity-60">© {new Date().getFullYear()} {t("home.footer")}</footer></div>
    </main>
  );
}
