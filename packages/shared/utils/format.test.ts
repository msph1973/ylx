import { describe, it, expect } from "vitest";
import { formatDate } from "./format";

describe("formatDate", () => {
  it("formats a plain Date object", () => {
    expect(formatDate(new Date(2026, 4, 1))).toBe("May 1, 2026");
  });

  it("formats a date-only string in local time (no off-by-one day)", () => {
    expect(formatDate("2026-05-01")).toBe("May 1, 2026");
  });

  it("returns — for an unparsable date string", () => {
    expect(formatDate("not-a-date")).toBe("—");
  });

  it("returns — for an impossible calendar date instead of rolling it over", () => {
    // `new Date(year, month - 1, day)` silently rolls "2026-02-31" over to
    // March 3, 2026 instead of producing an invalid date — formatDate must
    // reject it instead of rendering a wrong-but-valid-looking date.
    expect(formatDate("2026-02-31")).toBe("—");
  });
});
