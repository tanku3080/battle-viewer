"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      sessionStorage.removeItem("battle-viewer:last-activity");
      router.replace("/");
    }
  };

  return (
    <button
      type="button"
      onClick={logout}
      className="px-4 py-2 rounded-md bg-gray-700 text-white hover:bg-gray-600"
    >
      ログアウト
    </button>
  );
}
