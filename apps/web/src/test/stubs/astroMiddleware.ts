// Vitest/Vite cannot resolve Astro's virtual "astro:middleware" module (it only
// exists inside Astro's own build pipeline). `defineMiddleware` is just an
// identity function at runtime (Astro uses it purely for type inference), so a
// same-behavior stub lets middleware.ts be imported and unit-tested in isolation
// via the `astro:middleware` alias in vitest.config.ts.
export function defineMiddleware<T extends (...args: never[]) => unknown>(handler: T): T {
  return handler;
}
