import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getBattleHubApiBaseUrl } from "@/utils/battleHub/config";

async function proxy(request?: NextRequest) {
  try {
    const token = (await cookies()).get("battle_hub_session")?.value;
    const response = await fetch(`${getBattleHubApiBaseUrl()}/api/forces`, {
      method: request ? "POST" : "GET",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(request ? { "Content-Type": "application/json" } : {}),
      },
      ...(request ? { body: await request.text() } : {}),
      cache: "no-store",
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    return NextResponse.json({
      error: "Battle Hubに接続できません",
      details: [error instanceof Error ? error.message : "Unknown connection error"],
    }, { status: 502 });
  }
}

export async function GET() { return proxy(); }
export async function POST(request: NextRequest) { return proxy(request); }
