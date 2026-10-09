import type { RawBattleJson } from "@/utils/battle/loadBattleJson";
import type { ForceDefinition } from "@/utils/battle/forces";
import {
  desktopHubGet,
  desktopHubPost,
  desktopBattleDownload,
  isTauriRuntime,
} from "@/utils/tauri/bridge";

export type BattleHubHealth = {
  status: string;
};

export type BattleHubBattleSummary = {
  id: string;
  title: string;
  authorName: string;
  description: string;
  createdAt: string;
};

export type BattleHubPublishRequest = {
  authorName: string;
  description?: string;
  battleJson: RawBattleJson;
};

export type BattleHubBattleResponse = {
  id: string;
  title: string;
  authorName: string;
  description: string;
  battleJson: RawBattleJson;
  createdAt: string;
};

type BattleHubApiError = {
  error?: string;
  details?: string[];
};

async function parseError(response: Response) {
  try {
    const body = (await response.json()) as BattleHubApiError;
    const details = body.details?.filter(Boolean).join(", ");
    return details || body.error || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

function nativeError(result: { error?: string; status: number }) {
  return result.error || `HTTP ${result.status}`;
}

export async function getBattleHubForces(
  signal?: AbortSignal
): Promise<ForceDefinition[]> {
  if (isTauriRuntime()) {
    const result = await desktopHubGet<ForceDefinition[]>("forces");
    if (!result.ok || !result.data) throw new Error(nativeError(result));
    return result.data;
  }

  const response = await fetch("/api/battle-hub/forces", {
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<ForceDefinition[]>;
}

export async function createBattleHubForce(
  force: ForceDefinition
): Promise<ForceDefinition> {
  if (isTauriRuntime()) {
    const result = await desktopHubPost<ForceDefinition>("forces", force);
    if (!result.ok || !result.data) throw new Error(nativeError(result));
    return result.data;
  }

  const response = await fetch("/api/battle-hub/forces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(force),
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<ForceDefinition>;
}

export async function getBattleHubHealth(
  signal?: AbortSignal
): Promise<BattleHubHealth> {
  if (isTauriRuntime()) {
    const result = await desktopHubGet<BattleHubHealth>("health");
    if (!result.ok || !result.data) throw new Error(nativeError(result));
    return result.data;
  }

  const response = await fetch("/api/battle-hub/health", {
    method: "GET",
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<BattleHubHealth>;
}

export async function publishBattleToHub(
  request: BattleHubPublishRequest
): Promise<BattleHubBattleResponse> {
  if (isTauriRuntime()) {
    const result = await desktopHubPost<BattleHubBattleResponse>(
      "battles",
      request
    );
    if (!result.ok || !result.data) throw new Error(nativeError(result));
    return result.data;
  }

  const response = await fetch("/api/battle-hub/battles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<BattleHubBattleResponse>;
}

export async function getBattleHubBattles(): Promise<
  BattleHubBattleSummary[]
> {
  if (isTauriRuntime()) {
    const result = await desktopHubGet<BattleHubBattleSummary[]>("battles");
    if (!result.ok || !result.data) throw new Error(nativeError(result));
    return result.data;
  }

  const response = await fetch("/api/battle-hub/battles", {
    method: "GET",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<BattleHubBattleSummary[]>;
}

export async function downloadLegacyBattle(id: string): Promise<RawBattleJson> {
  if (isTauriRuntime()) return desktopBattleDownload(id);
  const response = await fetch(`/api/battle-hub/battles/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(await parseError(response));
  const payload = await response.json() as BattleHubBattleResponse;
  return payload.battleJson;
}
