"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { isTauriRuntime } from "@/utils/tauri/bridge";

type TauriWindow = Awaited<
  ReturnType<typeof import("@tauri-apps/api/window")["getCurrentWindow"]>
>;

export function TauriWindowChrome() {
  const { t } = useI18n();
  const windowRef = useRef<TauriWindow | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [maximized, setMaximized] = useState(true);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;

    import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      if (disposed) return;

      const appWindow = getCurrentWindow();
      windowRef.current = appWindow;

      const initialMaximized = await appWindow.isMaximized().catch(() => true);
      if (!disposed) {
        setMaximized(initialMaximized);
        setReady(true);
      }

      unlisten = await appWindow.onResized(async () => {
        const next = await appWindow.isMaximized().catch(() => false);
        if (!disposed) setMaximized(next);
      });
    });

    return () => {
      disposed = true;
      unlisten?.();
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  const reveal = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setVisible(true);
  };

  const scheduleHide = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => {
      setVisible(false);
      hideTimerRef.current = null;
    }, 500);
  };

  const minimize = () => windowRef.current?.minimize();
  const close = () => windowRef.current?.close();

  const toggleMaximize = async () => {
    const appWindow = windowRef.current;
    if (!appWindow) return;
    await appWindow.toggleMaximize();
    setMaximized(await appWindow.isMaximized().catch(() => !maximized));
  };

  if (!ready) return null;

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed left-0 right-0 top-0 z-[9998] h-2"
        onPointerEnter={reveal}
      />

      <div
        role="toolbar"
        aria-label={t("window.titlebar")}
        onPointerEnter={reveal}
        onPointerLeave={scheduleHide}
        className={
          "fixed left-0 right-0 top-0 z-[9999] grid h-10 grid-cols-[1fr_auto] " +
          "select-none border-b border-gray-700 bg-[#0b1020]/95 text-gray-100 shadow-lg " +
          "backdrop-blur transition-transform duration-150 " +
          (visible ? "translate-y-0" : "-translate-y-full")
        }
      >
        <div
          data-tauri-drag-region
          className="flex min-w-0 items-center px-3 text-xs text-gray-400"
          onDoubleClick={() => void toggleMaximize()}
        >
          <span data-tauri-drag-region className="truncate">
            Battle Viewer
          </span>
        </div>

        <div className="flex h-10 items-stretch">
          <button
            type="button"
            title={t("window.minimize")}
            aria-label={t("window.minimize")}
            onClick={() => void minimize()}
            className="flex w-12 items-center justify-center text-gray-200 hover:bg-gray-700"
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18">
              <path d="M3 13.5h12" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>

          <button
            type="button"
            title={maximized ? t("window.restore") : t("window.maximize")}
            aria-label={maximized ? t("window.restore") : t("window.maximize")}
            onClick={() => void toggleMaximize()}
            className="flex w-12 items-center justify-center text-gray-200 hover:bg-gray-700"
          >
            {maximized ? (
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18">
                <rect x="5.5" y="3.5" width="9" height="9" fill="none" stroke="currentColor" />
                <path d="M3.5 6.5v8h8" fill="none" stroke="currentColor" />
              </svg>
            ) : (
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18">
                <rect x="3.5" y="3.5" width="11" height="11" fill="none" stroke="currentColor" />
              </svg>
            )}
          </button>

          <button
            type="button"
            title={t("window.close")}
            aria-label={t("window.close")}
            onClick={() => void close()}
            className="flex w-12 items-center justify-center text-gray-200 hover:bg-red-600 hover:text-white"
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
