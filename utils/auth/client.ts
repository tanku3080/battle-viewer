import {
  desktopLogin,
  desktopLogout,
  desktopSession,
  isTauriRuntime,
  type DesktopSession,
} from "@/utils/tauri/bridge";

type AuthErrorBody = {
  error?: string;
  details?: string[];
};

async function errorMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as AuthErrorBody | null;
  return body?.details?.join(", ") ?? body?.error ?? fallback;
}

export async function login(
  username: string,
  password: string
): Promise<DesktopSession> {
  if (isTauriRuntime()) {
    const result = await desktopLogin({ username, password });
    if (!result.ok || !result.data) {
      throw new Error(result.error ?? "Sign-in failed");
    }
    return result.data;
  }

  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response, "Sign-in failed"));
  }

  return response.json() as Promise<DesktopSession>;
}

export async function session(): Promise<DesktopSession | null> {
  if (isTauriRuntime()) {
    const result = await desktopSession();
    if (result.status === 401) return null;
    if (!result.ok || !result.data) {
      throw new Error(result.error ?? "Session check failed");
    }
    return result.data;
  }

  const response = await fetch("/api/auth/session", {
    method: "GET",
    cache: "no-store",
  });
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(await errorMessage(response, "Session check failed"));
  }
  return response.json() as Promise<DesktopSession>;
}

export async function logout() {
  if (isTauriRuntime()) {
    await desktopLogout();
    return;
  }

  await fetch("/api/auth/logout", { method: "POST" });
}
