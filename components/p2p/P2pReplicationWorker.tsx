"use client";

import { hasAcceptedHubTerms } from "@/utils/battleHub/terms";
import { useEffect } from "react";
import { isTauriRuntime, desktopP2pFetch, desktopP2pStatus } from "@/utils/tauri/bridge";
import { listDistributedWorks } from "@/utils/battleHub/works";

/**
 * Best-effort volunteer replication, active only while Desktop runs and the
 * user has explicitly enabled both download and redistribution. Hub continues
 * to authorize each transfer; no remote content is stored by Hub.
 */
export function P2pReplicationWorker() {
  useEffect(() => {
    if (!isTauriRuntime() || !hasAcceptedHubTerms()) return;
    let disposed = false;
    let busy = false;

    const replicate = async () => {
      if (disposed || busy) return;
      busy = true;
      try {
        const state = await desktopP2pStatus();
        if (!state.networkActive || !state.settings?.participationEnabled ||
            !state.settings.downloadsEnabled || !state.settings.redistributionEnabled) return;
        const catalog = await listDistributedWorks();
        let completed = 0;
        for (const work of catalog.items) {
          if (disposed || completed >= 2) break;
          if (work.distributionState !== "ACTIVE" || !work.downloadable ||
              work.onlineReplicaCount >= work.targetReplicas) continue;
          try {
            // A validated native cache write and receipt-based replica registration.
            await desktopP2pFetch(work.id);
            completed += 1;
          } catch {
            // Offline routes, expired grants and capacity limits fail closed.
          }
        }
      } catch {
        // No session or Hub outage never starts unapproved networking.
      } finally {
        busy = false;
      }
    };

    const onConsent = () => { void replicate(); };
    window.addEventListener("battle-viewer:hub-terms-accepted", onConsent);
    void replicate();
    const timer = setInterval(() => { void replicate(); }, 60_000);
    return () => { disposed = true; clearInterval(timer); window.removeEventListener("battle-viewer:hub-terms-accepted", onConsent); };
  }, []);

  return null;
}
