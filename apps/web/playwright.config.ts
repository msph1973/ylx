import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4321',
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: 'pnpm dev',
    port: 4321,
    reuseExistingServer: true,
    timeout: 60000,
    env: {
      ...process.env,
      SESSION_SECRET: process.env.PLAYWRIGHT_SESSION_SECRET ?? 'playwright-session-secret',
    },
  },
});
