"use client";

import { useRouter } from "next/navigation";
import { logout as logoutSession } from "@/utils/auth/client";

export function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    try {
      await logoutSession();
    } finally {
      localStorage.removeItem("battle-viewer:last-activity");
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
