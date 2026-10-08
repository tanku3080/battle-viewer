"use client";

import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { BattleHubAccessButton } from "@/components/battleHub/BattleHubAccessButton";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/i18n/I18nProvider";

export default function HomePage() {
  const { t } = useI18n();
  return (
    <main className="min-h-screen flex flex-col items-center justify-between px-4 py-10 bg-[#0b1020] text-[#f5f5f5]">
      <header className="w-full max-w-4xl mt-4">
        <div className="flex justify-end gap-3 mb-8">
          <LanguageSwitcher />
          <LogoutButton />
        </div>
        <div className="text-center">
          <h1 className="text-4xl font-semibold mb-2">{t("home.title")}</h1>
          <p className="opacity-70">{t("home.subtitle")}</p>
        </div>
      </header>

      <section className="flex flex-col gap-4 text-center">
        <Link href="/battle" className="px-8 py-3 bg-blue-600 rounded-lg text-white font-semibold hover:bg-blue-700">{t("home.view")}</Link>
        <Link href="/create" className="px-8 py-3 bg-violet-600 rounded-lg text-white font-semibold hover:bg-violet-700">{t("home.create")}</Link>
        <BattleHubAccessButton className="px-8 py-3 font-semibold" />
      </section>

      <footer className="text-xs opacity-60 mb-4">© {new Date().getFullYear()} {t("home.footer")}</footer>
    </main>
  );
}
