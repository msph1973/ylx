import { describe, it, expect } from "vitest";
import { hasValidCsrfOrigin } from "./middleware";

// `middleware.ts` imports `defineMiddleware` from the virtual `astro:middleware`
// module, which only exists inside Astro's own build/dev pipeline. Vitest can't
// resolve it directly — `vitest.config.ts` aliases it to a same-behavior stub
// (`src/test/stubs/astroMiddleware.ts`) so this module loads normally in tests.

// This suite covers only the exported `hasValidCsrfOrigin` pure function.
// The full Astro `onRequest` middleware isn't exercised here — there's no
// Astro middleware test harness set up in this repo, so testing `onRequest`
// directly is out of scope.

const REQUEST_URL = "https://ylex.my.id/api/admin/albums";

describe("hasValidCsrfOrigin", () => {
  it("accepts a matching Origin header", () => {
    const request = new Request(REQUEST_URL, {
      headers: { origin: "https://ylex.my.id" },
    });
    expect(hasValidCsrfOrigin(request, REQUEST_URL)).toBe(true);
  });

  it("rejects a mismatched Origin header", () => {
    const request = new Request(REQUEST_URL, {
      headers: { origin: "https://evil.example" },
    });
    expect(hasValidCsrfOrigin(request, REQUEST_URL)).toBe(false);
  });

  it("rejects a malformed Origin header", () => {
    const request = new Request(REQUEST_URL, {
      headers: { origin: "not-a-valid-url" },
    });
    expect(hasValidCsrfOrigin(request, REQUEST_URL)).toBe(false);
  });

  it("accepts a matching Referer header when Origin is absent", () => {
    const request = new Request(REQUEST_URL, {
      headers: { referer: "https://ylex.my.id/admin/dashboard" },
    });
    expect(hasValidCsrfOrigin(request, REQUEST_URL)).toBe(true);
  });

  it("rejects a mismatched Referer header when Origin is absent", () => {
    const request = new Request(REQUEST_URL, {
      headers: { referer: "https://evil.example/phishing" },
    });
    expect(hasValidCsrfOrigin(request, REQUEST_URL)).toBe(false);
  });

  it("rejects a malformed Referer header when Origin is absent", () => {
    const request = new Request(REQUEST_URL, {
      headers: { referer: "not-a-valid-url" },
    });
    expect(hasValidCsrfOrigin(request, REQUEST_URL)).toBe(false);
  });

  it("rejects the request when both Origin and Referer are absent (fail-closed)", () => {
    const request = new Request(REQUEST_URL);
    expect(hasValidCsrfOrigin(request, REQUEST_URL)).toBe(false);
  });
});
