import { describe, it, expect } from "vitest";
import { validateBrand, contrastRatio } from "./brand";

describe("validateBrand accentColor", () => {
  it("rejects non-hex accent", () => {
    expect(validateBrand({ accentColor: "red" }).ok).toBe(false);
  });

  it("rejects low-contrast accent vs #0a0a0a", () => {
    // Near-black on near-black background — well below WCAG AA (4.5).
    expect(validateBrand({ accentColor: "#111111" }).ok).toBe(false);
  });

  it("accepts a good accent", () => {
    expect(validateBrand({ accentColor: "#e8a06a" }).ok).toBe(true);
  });

  it("rejects short hex and missing hash", () => {
    expect(validateBrand({ accentColor: "#fff" }).ok).toBe(false);
    expect(validateBrand({ accentColor: "e8a06a" }).ok).toBe(false);
  });

  it("accepts uppercase hex", () => {
    expect(validateBrand({ accentColor: "#E8A06A" }).ok).toBe(true);
  });

  it("accepts empty brand", () => {
    expect(validateBrand({}).ok).toBe(true);
  });
});

describe("validateBrand logoUrl", () => {
  it("rejects relative URLs", () => {
    expect(validateBrand({ logoUrl: "/logo.png" }).ok).toBe(false);
  });

  it("rejects non-https URLs", () => {
    expect(validateBrand({ logoUrl: "http://example.com/logo.png" }).ok).toBe(false);
  });

  it("accepts absolute https URLs", () => {
    expect(validateBrand({ logoUrl: "https://example.com/logo.png" }).ok).toBe(true);
  });
});

describe("contrastRatio", () => {
  it("returns 1 for identical colors", () => {
    expect(contrastRatio("#0a0a0a", "#0a0a0a")).toBeCloseTo(1, 5);
  });

  it("rates #e8a06a above 4.5 vs #0a0a0a", () => {
    expect(contrastRatio("#e8a06a", "#0a0a0a")).toBeGreaterThanOrEqual(4.5);
  });

  it("rates #111111 below 4.5 vs #0a0a0a", () => {
    expect(contrastRatio("#111111", "#0a0a0a")).toBeLessThan(4.5);
  });
});
