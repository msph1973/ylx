import { describe, expect, it } from "vitest";
import { isValidInviteEmail } from "./email.js";

describe("isValidInviteEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(isValidInviteEmail("vendor@studio.com")).toBe(true);
    expect(isValidInviteEmail("a.b+tag@sub.example.co.id")).toBe(true);
  });

  it("rejects missing/at-edge @ and dotless domains", () => {
    expect(isValidInviteEmail("not-an-email")).toBe(false);
    expect(isValidInviteEmail("@studio.com")).toBe(false);
    expect(isValidInviteEmail("a@b@c.com")).toBe(false);
    expect(isValidInviteEmail("vendor@studio")).toBe(false);
    expect(isValidInviteEmail("vendor@.com")).toBe(false);
    expect(isValidInviteEmail("vendor@studio.")).toBe(false);
  });

  it("rejects whitespace and overlong input", () => {
    expect(isValidInviteEmail("a @studio.com")).toBe(false);
    expect(isValidInviteEmail(`a@${"x".repeat(250)}.com`)).toBe(false);
  });

  it("rejects ReDoS-shaped input fast", () => {
    const evil = "!@!" + "!.".repeat(5000);
    const start = Date.now();
    expect(isValidInviteEmail(evil)).toBe(false);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
