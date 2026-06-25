import type { AstroCookies } from "astro";

export interface AdminSession {
  id: string;
  email: string;
  name: string;
  role: string;
  expiresAt: number;
}

export function getSession(cookies: AstroCookies): AdminSession | null {
  const sessionCookie = cookies.get("admin_session");
  if (!sessionCookie) {
    return null;
  }

  try {
    const session = JSON.parse(sessionCookie.value) as AdminSession;
    if (session.expiresAt < Date.now()) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function requireAdmin(cookies: AstroCookies): AdminSession | null {
  const session = getSession(cookies);
  if (!session || (session.role !== "admin" && session.role !== "photographer")) {
    return null;
  }
  return session;
}
