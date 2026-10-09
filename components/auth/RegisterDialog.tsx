"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { register } from "@/utils/auth/client";
import { useI18n } from "@/i18n/I18nProvider";

export function RegisterDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (Array.from(username).length > 10) return setError(t("register.usernameInvalid"));
    const length = Array.from(password).length;
    if (length < 8 || length > 20 || !/\p{L}/u.test(password) || !/\p{N}/u.test(password) || /\s/u.test(password)) {
      return setError(t("register.passwordInvalid"));
    }
    setLoading(true);
    try {
      await register({ username, email, password });
      setCompleted(true);
      setPassword("");
    } catch (error) {
      setError(error instanceof Error ? error.message : t("register.failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="register-title"
        className="w-full max-w-md rounded-xl border border-gray-600 bg-[#111827] p-5 text-gray-100 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="register-title" className="text-xl font-semibold">{t("register.title")}</h2>
          <button ref={closeRef} type="button" onClick={onClose}
            aria-label={t("common.close")} className="rounded border border-gray-600 px-3 py-1 hover:bg-gray-700">×</button>
        </div>
        {completed ? (
          <div role="status" className="space-y-4">
            <p>{t("register.success")}</p>
            <button type="button" onClick={onClose} className="w-full rounded bg-blue-600 px-4 py-2">{t("common.close")}</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-sm">{t("register.email")}
              <input autoComplete="email" type="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)}
                className="mt-1 block w-full rounded border border-gray-500 bg-[#0b1020] px-3 py-2" />
            </label>
            <label className="block text-sm">{t("login.username")}
              <input autoComplete="username" required maxLength={10} value={username}
                onChange={e => setUsername(e.target.value)}
                aria-describedby="register-user-hint"
                className="mt-1 block w-full rounded border border-gray-500 bg-[#0b1020] px-3 py-2" />
              <span id="register-user-hint" className="mt-1 block text-xs text-gray-400">{t("register.usernameHint")}</span>
            </label>
            <label className="block text-sm">{t("login.password")}
              <input autoComplete="new-password" type="password" required minLength={8} maxLength={20}
                value={password} onChange={e => setPassword(e.target.value)}
                aria-describedby="register-password-hint"
                className="mt-1 block w-full rounded border border-gray-500 bg-[#0b1020] px-3 py-2" />
              <span id="register-password-hint" className="mt-1 block text-xs text-gray-400">{t("register.passwordHint")}</span>
            </label>
            {error && <p role="alert" className="rounded bg-red-950 p-3 text-sm text-red-200">{error}</p>}
            <button type="submit" disabled={loading} className="w-full rounded bg-blue-600 px-4 py-2 font-semibold hover:bg-blue-700 disabled:opacity-50">
              {loading ? t("register.saving") : t("register.submit")}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
