import type { BattleEvent, HierarchyStatus } from "@/types/battle";

export type LegacyDestroyedEvent = {
  t: number;
  event: "destroyed";
  target: string;
};

export type LegacyDetachEvent = {
  t: number;
  event: "detach";
  source: string;
  from?: string;
};

export type LegacyTransferEvent = {
  t: number;
  event: "transfer";
  source: string;
  from?: string;
  to: string;
};

export type RawBattleEvent =
  | BattleEvent
  | LegacyDestroyedEvent
  | LegacyDetachEvent
  | LegacyTransferEvent;

function statusEvent(
  t: number,
  target: string,
  status: HierarchyStatus
): BattleEvent {
  return { t, event: "status", target, status };
}

/**
 * 入力JSONの旧event名を、描画ランタイムが扱う少数の正規eventへ変換する。
 *
 * - destroyed -> status(destroyed)
 * - detach    -> reparent(parent=null)
 * - transfer  -> reparent + status(active)  // 旧挙動の復帰を維持
 * - merge / reform / status / reparent はそのまま
 */
export function normalizeBattleEvents(events: RawBattleEvent[]): BattleEvent[] {
  return events.flatMap((event): BattleEvent[] => {
    if (event.event === "destroyed") {
      return [statusEvent(event.t, event.target, "destroyed")];
    }

    if (event.event === "detach") {
      return [
        {
          t: event.t,
          event: "reparent",
          target: event.source,
          parent: null,
        },
      ];
    }

    if (event.event === "transfer") {
      return [
        {
          t: event.t,
          event: "reparent",
          target: event.source,
          parent: event.to,
        },
        statusEvent(event.t, event.source, "active"),
      ];
    }

    return [event];
  });
}
