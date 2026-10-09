"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { login, requestPasswordReset } from "@/utils/auth/client";
import { useI18n } from "@/i18n/I18nProvider";
import { RegisterDialog } from "@/components/auth/RegisterDialog";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [showRegistration, setShowRegistration] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetNotice, setResetNotice] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);
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
    <main className="relative min-h-dvh bg-[#050816] text-gray-100 flex items-center justify-center px-4 py-6 sm:px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-xl border border-gray-700 bg-[#111827] p-4 shadow-2xl sm:p-6">
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
        <button type="button" onClick={() => { setShowReset(value => !value); setResetNotice(""); }}
          className="mt-3 w-full rounded border border-gray-500 px-3 py-2 hover:bg-gray-700">{t("account.resetOpen")}</button>
        {showReset && <section aria-label={t("account.resetOpen")} className="mt-3 rounded border border-gray-600 p-3">
          <p className="mb-2 text-sm text-gray-300">{t("account.resetExplanation")}</p>
          <form onSubmit={async event => {
            event.preventDefault();
            if (resetSubmitting) return;
            setResetSubmitting(true); setResetNotice("");
            try {
              await requestPasswordReset(resetEmail);
              setResetNotice(t("account.resetRequested"));
            } catch (error) {
              setResetNotice(error instanceof Error ? error.message : t("account.resetFailed"));
            } finally { setResetSubmitting(false); }
          }}>
            <label className="block text-sm">{t("register.email")}
              <input type="email" autoComplete="email" required maxLength={254}
                value={resetEmail} onChange={event => setResetEmail(event.target.value)}
                className="mt-1 w-full rounded border border-gray-500 bg-[#0b1020] px-3 py-2" />
            </label>
            <button type="submit" disabled={resetSubmitting} className="mt-3 min-h-11 w-full rounded bg-blue-600 p-2 disabled:opacity-40">{t("account.resetSubmit")}</button>
          </form>
          {resetNotice && <p role="status" aria-live="polite" className="mt-3 text-sm">{resetNotice}</p>}
        </section>}
        <button type="button" onClick={() => setShowRegistration(true)} className="mt-4 w-full rounded border border-gray-500 px-3 py-2 hover:bg-gray-700">{t("register.open")}</button>
      </form>
      {showRegistration && <RegisterDialog onClose={() => setShowRegistration(false)} />}
    </main>
  );
}
