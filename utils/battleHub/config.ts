export const DEFAULT_BATTLE_HUB_API_BASE_URL = "http://localhost:8080";

export function getBattleHubApiBaseUrl(
  configured = process.env.BATTLE_HUB_API_BASE_URL
) {
  return (configured ?? DEFAULT_BATTLE_HUB_API_BASE_URL).replace(/\/$/, "");
}
