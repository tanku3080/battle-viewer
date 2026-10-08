import {
  desktopHubGet,
  desktopP2pPublish,
  desktopP2pFetch,
  isTauriRuntime,
} from "@/utils/tauri/bridge";

export type DistributedWork = {
  id: string;
  title: string;
  authorName: string;
  description: string;
  createdAt: string;
  contentHash: string;
  compressedHash: string;
  compressedSize: number;
  uncompressedSize: number;
  replicaCount: number;
  onlineReplicaCount: number;
  targetReplicas: number;
  distributionState: string;
  downloadStatus: string;
  downloadable: boolean;
  contentValidation: string;
};

export type WorkCatalogPage = {
  items: DistributedWork[];
  total: number;
  limit: number;
  offset: number;
};

export async function listDistributedWorks(query = ""): Promise<WorkCatalogPage> {
  if (isTauriRuntime()) {
    const result = await desktopHubGet<WorkCatalogPage>("works");
    if (!result.ok || !result.data) throw new Error(result.error ?? "Work list unavailable");
    return result.data;
  }
  const response = await fetch(`/api/battle-hub/works?query=${encodeURIComponent(query)}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Battle Hub HTTP ${response.status}`);
  return response.json() as Promise<WorkCatalogPage>;
}

export async function publishDistributedWork(raw: string, description = ""): Promise<DistributedWork> {
  if (!isTauriRuntime()) throw new Error("Desktop application required");
  return desktopP2pPublish(raw, description);
}

export async function fetchDistributedWork(work: DistributedWork): Promise<string> {
  if (!isTauriRuntime()) throw new Error("Desktop application required");
  return desktopP2pFetch(work.id);
}
