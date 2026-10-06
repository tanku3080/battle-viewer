import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getBattleHubApiBaseUrl } from "@/utils/battleHub/config";

const COOKIE_NAME = "battle_hub_session";

export async function POST() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;

  if (token) {
    try {
      await fetch(`${getBattleHubApiBaseUrl()}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
    } catch {
      // CookieはBE到達可否にかかわらず必ず破棄する。
    }
  }

  const response = new NextResponse(null, { status: 204 });
  response.cookies.delete(COOKIE_NAME);
  return response;
}
