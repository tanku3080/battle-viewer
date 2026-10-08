import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getBattleHubApiBaseUrl } from "@/utils/battleHub/config";

const COOKIE_NAME = "battle_hub_session";

export async function GET() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const response = await fetch(
      `${getBattleHubApiBaseUrl()}/api/auth/session`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }
    );
    const body = await response.text();

    if (!response.ok) {
      const next = new NextResponse(body, {
        status: response.status,
        headers: {
          "Content-Type":
            response.headers.get("content-type") ?? "application/json",
        },
      });
      if (response.status === 401) next.cookies.delete(COOKIE_NAME);
      return next;
    }

    const payload = JSON.parse(body) as {
      username: string;
      expiresAt: string;
    };

    const next = NextResponse.json({
      username: payload.username,
      expiresAt: payload.expiresAt,
    });
    next.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60,
    });
    return next;
  } catch (error) {
    return NextResponse.json(
      {
        error: "Cannot connect to Battle Hub",
        details: [
          error instanceof Error ? error.message : "Unknown connection error",
        ],
      },
      { status: 502 }
    );
  }
}
