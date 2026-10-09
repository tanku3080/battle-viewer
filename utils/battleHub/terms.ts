"use client";

export const HUB_TERMS_VERSION = "2";
export const HUB_TERMS_KEY = "battle-viewer:hub-terms-accepted:v" + HUB_TERMS_VERSION;

/** An explicit local decision is required before catalog, transfer or P2P traffic. */
export function hasAcceptedHubTerms(): boolean {
  try {
    return typeof window !== "undefined" &&
      window.localStorage.getItem(HUB_TERMS_KEY) === "accepted";
  } catch {
    return false;
  }
}

export function acceptHubTerms(): void {
  window.localStorage.setItem(HUB_TERMS_KEY, "accepted");
  window.dispatchEvent(new Event("battle-viewer:hub-terms-accepted"));
}
