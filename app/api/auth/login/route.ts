import { NextRequest, NextResponse } from "next/server";
import { getBattleHubApiBaseUrl } from "@/utils/battleHub/config";

const COOKIE_NAME = "battle_hub_session";
const ONE_HOUR = 60 * 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const response = await fetch(
      `${getBattleHubApiBaseUrl()}/api/auth/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        cache: "no-store",
      }
    );

    const text = await response.text();
    if (!response.ok) {
      return new NextResponse(text, {
        status: response.status,
        headers: {
          "Content-Type":
            response.headers.get("content-type") ?? "application/json",
        },
      });
    }

    const payload = JSON.parse(text) as {
      token: string;
      username: string;
      expiresAt: string;
    };

    const next = NextResponse.json({
      username: payload.username,
      expiresAt: payload.expiresAt,
    });
    next.cookies.set(COOKIE_NAME, payload.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ONE_HOUR,
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
