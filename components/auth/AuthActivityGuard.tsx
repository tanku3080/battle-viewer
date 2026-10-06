"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const IDLE_LIMIT_MS = 60 * 60 * 1000;
const TOUCH_THROTTLE_MS = 60 * 1000;
const LAST_ACTIVITY_KEY = "battle-viewer:last-activity";

export function AuthActivityGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const lastTouchRef = useRef(0);

  useEffect(() => {
    let disposed = false;

    const redirectToLogin = async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } finally {
        if (!disposed) router.replace("/");
      }
    };

    const touchSession = async () => {
      const response = await fetch("/api/auth/session", {
        method: "GET",
        cache: "no-store",
      });
      if (response.status === 401) {
        await redirectToLogin();
        return false;
      }
      return response.ok;
    };

    const initialize = async () => {
      const ok = await touchSession();
      if (!ok) return;
      const now = Date.now();
      localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
      lastTouchRef.current = now;
    };

    const onActivity = async () => {
      const now = Date.now();
      const stored = Number(localStorage.getItem(LAST_ACTIVITY_KEY) ?? now);

      if (Number.isFinite(stored) && now - stored >= IDLE_LIMIT_MS) {
        await redirectToLogin();
        return;
      }

      localStorage.setItem(LAST_ACTIVITY_KEY, String(now));

      if (now - lastTouchRef.current >= TOUCH_THROTTLE_MS) {
        lastTouchRef.current = now;
        await touchSession();
      }
    };

    void initialize();

    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "wheel",
      "touchstart",
    ];

    events.forEach((name) =>
      window.addEventListener(name, onActivity, { passive: true })
    );

    return () => {
      disposed = true;
      events.forEach((name) => window.removeEventListener(name, onActivity));
    };
  }, [router]);

  return children;
}
