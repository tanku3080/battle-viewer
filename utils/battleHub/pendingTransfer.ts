"use client";

// In-memory handoff keeps large (up to 32 MiB) raw JSON out of sessionStorage.
// App Router client navigation preserves the same JS module instance.
let pending: string | null = null;
export function stageDistributedJson(raw: string) { pending = raw; }
export function consumeDistributedJson(): string | null {
  const value = pending;
  pending = null;
  return value;
}
