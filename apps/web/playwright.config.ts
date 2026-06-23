import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 2,
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
  },
});
