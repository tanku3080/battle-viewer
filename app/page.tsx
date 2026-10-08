"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/utils/auth/client";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/i18n/I18nProvider";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await login(username, password);
      localStorage.setItem("battle-viewer:last-activity", String(Date.now()));
      router.replace("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative min-h-screen bg-[#050816] text-gray-100 flex items-center justify-center px-4">
      <LanguageSwitcher className="absolute right-4 top-4" />
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-xl border border-gray-700 bg-[#111827] p-6 shadow-2xl">
        <h1 className="text-2xl font-semibold mb-2">Battle Viewer</h1>
        <p className="text-sm text-gray-300 mb-6">{t("login.description")}</p>

        <label className="block mb-4">
          <span className="block text-sm mb-1">{t("login.username")}</span>
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required
            aria-describedby={error ? "login-error" : undefined} aria-invalid={Boolean(error)}
            className="w-full rounded-md border border-gray-600 bg-[#0b1020] px-3 py-2 focus:border-blue-400" />
        </label>

        <label className="block mb-5">
          <span className="block text-sm mb-1">{t("login.password")}</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required
            aria-describedby={error ? "login-error" : undefined} aria-invalid={Boolean(error)}
            className="w-full rounded-md border border-gray-600 bg-[#0b1020] px-3 py-2 focus:border-blue-400" />
        </label>

        {error && <div id="login-error" role="alert" className="mb-4 rounded border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-200">{error}</div>}

        <button type="submit" disabled={isSubmitting} className="w-full rounded-md bg-blue-600 py-2 font-semibold hover:bg-blue-700 disabled:opacity-50">
          {isSubmitting ? t("login.submitting") : t("login.submit")}
        </button>
      </form>
    </main>
  );
}
