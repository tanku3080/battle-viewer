import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getBattleHubApiBaseUrl } from "@/utils/battleHub/config";

async function forward(path: string) {
  const token = (await cookies()).get("battle_hub_session")?.value;
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const response = await fetch(`${getBattleHubApiBaseUrl()}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Battle Hub unavailable" }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  const query = new URL(request.url).searchParams;
  const parameters = new URLSearchParams({
    query: (query.get("query") ?? "").slice(0, 200),
    limit: "50",
    offset: "0",
  });
  return forward(`/api/v2/works?${parameters.toString()}`);
}
