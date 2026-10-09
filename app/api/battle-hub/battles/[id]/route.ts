import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getBattleHubApiBaseUrl } from "@/utils/battleHub/config";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid battle ID" }, { status: 400 });
  }
  const token = (await cookies()).get("battle_hub_session")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const response = await fetch(getBattleHubApiBaseUrl() + "/api/battles/" + id, {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
    });
    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Cannot connect to Battle Hub" }, { status: 502 });
  }
}
