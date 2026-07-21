import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Unit tests live in src/. The Playwright suite in tests/ is run separately
    // via `pnpm test:e2e` and must not be picked up by Vitest.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Astro's virtual "astro:middleware" module only exists inside Astro's
      // build pipeline; middleware.ts needs it resolvable to be unit-testable.
      'astro:middleware': fileURLToPath(new URL('./src/test/stubs/astroMiddleware.ts', import.meta.url)),
    },
  },
});
