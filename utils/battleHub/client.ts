import type { RawBattleJson } from "@/utils/battle/loadBattleJson";

export type BattleHubHealth = {
  status: string;
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

export async function getBattleHubHealth(
  signal?: AbortSignal
): Promise<BattleHubHealth> {
  const response = await fetch("/api/battle-hub/health", {
    method: "GET",
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json() as Promise<BattleHubHealth>;
}

export async function publishBattleToHub(
  request: BattleHubPublishRequest
): Promise<BattleHubBattleResponse> {
  const response = await fetch("/api/battle-hub/battles", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json() as Promise<BattleHubBattleResponse>;
}
