import crypto from 'node:crypto';
import type { BrowserContext } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4321';
const SESSION_SECRET = process.env.PLAYWRIGHT_SESSION_SECRET ?? 'playwright-session-secret';

function hmac(payload: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
}

function signAdminSession(): string {
  const payload = Buffer.from(JSON.stringify({
    id: 'playwright-admin',
    email: 'admin@ylx.test',
    name: 'Playwright Admin',
    role: 'admin',
    expiresAt: Date.now() + 60 * 60 * 1000,
    // NOTE (M-1 session revocation, see new-audit.md / STATUS.md): `getSession()`
    // now also verifies this against the `playwright-admin` doc's current
    // `sessionVersion` in Sanity. There is no such doc in a real project, so
    // this fake cookie will only pass `getSession()` against a test/staging
    // Sanity dataset that has a matching admin doc seeded with `sessionVersion: 0`.
    // Known gap — not fixed in this change; e2e specs relying on this helper to
    // reach server-rendered admin pages need that fixture added separately.
    sessionVersion: 0,
  })).toString('base64url');

  return `${payload}.${hmac(payload)}`;
}

export async function seedAdminSession(context: BrowserContext): Promise<void> {
  await context.addCookies([
    {
      name: 'admin_session',
      value: signAdminSession(),
      url: BASE_URL,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}