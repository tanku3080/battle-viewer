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


export type P2pSettings = {
  version: number;
  participationEnabled: boolean;
  downloadsEnabled: boolean;
  redistributionEnabled: boolean;
  cacheQuotaBytes: number;
  uploadLimitBytesPerSecond: number;
};

export type P2pStatus = {
  available: boolean;
  networkActive: boolean;
  settings?: P2pSettings;
  identity?: {
    installationId: string;
  };
  cacheUsedBytes?: number;
  initializationError?: string;
};

export type P2pInventoryEntry = {
  contentHash: string;
  compressedHash: string;
  compressedSize: number;
  uncompressedSize: number;
  storedBytes: number;
};

export type P2pInventory = {
  entries: P2pInventoryEntry[];
  corruptHashes: string[];
  usedBytes: number;
};

export type P2pUpdateSettingsRequest = {
  participationEnabled: boolean;
  downloadsEnabled: boolean;
  redistributionEnabled: boolean;
  cacheQuotaBytes: number;
  uploadLimitBytesPerSecond: number;
};

export async function desktopP2pStatus(): Promise<P2pStatus> {
  return invoke("p2p_get_status");
}

export async function desktopP2pInventory(): Promise<P2pInventory> {
  return invoke("p2p_get_inventory");
}

export async function desktopP2pUpdateSettings(
  request: P2pUpdateSettingsRequest
): Promise<P2pStatus> {
  return invoke("p2p_update_settings", { request });
}
