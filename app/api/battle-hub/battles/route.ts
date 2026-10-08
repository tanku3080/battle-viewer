import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getBattleHubApiBaseUrl } from "@/utils/battleHub/config";

async function forward(response: Response) {
  const body = await response.text();

  return new NextResponse(body, {
    status: response.status,
    headers: {
      "Content-Type":
        response.headers.get("content-type") ?? "application/json",
    },
  });
}

async function authorizationHeader(): Promise<Record<string, string>> {
  const token = (await cookies()).get("battle_hub_session")?.value;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function GET() {
  try {
    return forward(
      await fetch(`${getBattleHubApiBaseUrl()}/api/battles`, {
        headers: await authorizationHeader(),
        cache: "no-store",
      })
    );
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const response = await fetch(
      `${getBattleHubApiBaseUrl()}/api/battles`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authorizationHeader()),
        },
        body,
      }
    );

    return forward(response);
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
