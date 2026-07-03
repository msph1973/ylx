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