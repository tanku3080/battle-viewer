"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string; details?: string[] }
          | null;
        throw new Error(
          body?.details?.join(", ") ?? body?.error ?? "ログインに失敗しました"
        );
      }

      localStorage.setItem(
        "battle-viewer:last-activity",
        String(Date.now())
      );
      router.replace("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ログインに失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#050816] text-gray-100 flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-gray-700 bg-[#111827] p-6 shadow-2xl"
      >
        <h1 className="text-2xl font-semibold mb-2">Battle Viewer</h1>
        <p className="text-sm text-gray-400 mb-6">
          Battle Hubアカウントでログインしてください。
        </p>

        <label className="block mb-4">
          <span className="block text-sm mb-1">ユーザー名</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
            className="w-full rounded-md border border-gray-600 bg-[#0b1020] px-3 py-2 outline-none focus:border-blue-400"
          />
        </label>

        <label className="block mb-5">
          <span className="block text-sm mb-1">パスワード</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            className="w-full rounded-md border border-gray-600 bg-[#0b1020] px-3 py-2 outline-none focus:border-blue-400"
          />
        </label>

        {error && (
          <div className="mb-4 rounded border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-blue-600 py-2 font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? "ログイン中..." : "ログイン"}
        </button>
      </form>
    </main>
  );
}
