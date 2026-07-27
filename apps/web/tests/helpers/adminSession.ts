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
    // `getSession()` verifies this against the `playwright-admin` doc's
    // current `sessionVersion` in Sanity (M-1 session revocation). The doc is
    // seeded idempotently by scripts/seed-e2e-admin.mjs into the e2e dataset
    // (`test`) — CI runs it before the Playwright job; locally run it once
    // with PUBLIC_SANITY_DATASET=test before e2e against admin pages.
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