"use client";

import { invoke } from "@tauri-apps/api/core";

export type DesktopSession = {
  username: string;
  expiresAt: string;
};

export type DesktopLoginRequest = {
  username: string;
  password: string;
};

export type DesktopResponse<T> = {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
};

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function desktopLogin(
  request: DesktopLoginRequest
): Promise<DesktopResponse<DesktopSession>> {
  return invoke("auth_login", { request });
}

export async function desktopSession(): Promise<
  DesktopResponse<DesktopSession>
> {
  return invoke("auth_session");
}

export async function desktopLogout(): Promise<DesktopResponse<null>> {
  return invoke("auth_logout");
}

export async function desktopHubGet<T>(
  resource: "health" | "forces" | "battles"
): Promise<DesktopResponse<T>> {
  return invoke("hub_get", { resource });
}

export async function desktopHubPost<T>(
  resource: "forces" | "battles",
  body: unknown
): Promise<DesktopResponse<T>> {
  return invoke("hub_post", {
    resource,
    body: JSON.stringify(body),
  });
}
