"use client";

import { BattleHubAccessButton } from "@/components/battleHub/BattleHubAccessButton";

/** A single Battle Hub entry point; publishing lives in the catalog. */
export function BattleHubControls(_props: { battleJson?: unknown }) {
  return <BattleHubAccessButton className="min-h-11" />;
}
