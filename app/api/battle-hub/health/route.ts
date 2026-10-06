import { NextResponse } from "next/server";

const DEFAULT_BATTLE_HUB_API = "http://localhost:8080";

function getBattleHubApiBaseUrl() {
  return (process.env.BATTLE_HUB_API_BASE_URL ?? DEFAULT_BATTLE_HUB_API)
    .replace(/\/$/, "");
}

export async function GET() {
  try {
    const response = await fetch(`${getBattleHubApiBaseUrl()}/api/health`, {
      cache: "no-store",
    });
    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Battle Hubに接続できません",
        details: [
          error instanceof Error ? error.message : "Unknown connection error",
        ],
      },
      { status: 502 }
    );
  }
}
