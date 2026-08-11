import { describe, it, expect } from "vitest";
import { getAlbumStatusMeta, ALBUM_STATUS_FILTERS } from "./albumStatus";

describe("getAlbumStatusMeta", () => {
  it('returns active meta for "active"', () => {
    const meta = getAlbumStatusMeta("active");
    expect(meta.variant).toBe("active");
    expect(meta.label).toBe("Active");
  });

  it('returns submitted meta for "submitted"', () => {
    const meta = getAlbumStatusMeta("submitted");
    expect(meta.variant).toBe("submitted");
    expect(meta.label).toBe("Submitted");
  });

  it('returns locked meta for "locked"', () => {
    const meta = getAlbumStatusMeta("locked");
    expect(meta.variant).toBe("locked");
    expect(meta.label).toBe("Locked");
  });

  it('returns delivered meta for "delivered"', () => {
    const meta = getAlbumStatusMeta("delivered");
    expect(meta.variant).toBe("delivered");
    expect(meta.label).toBe("Delivered");
    expect(meta.hint).toContain("delivered");
  });

  it('returns locked meta for unknown statuses', () => {
    const meta = getAlbumStatusMeta("unknown");
    expect(meta.variant).toBe("locked");
    expect(meta.label).toBe("Locked");
  });

  it('returns locked meta for null/undefined', () => {
    expect(getAlbumStatusMeta(null).variant).toBe("locked");
    expect(getAlbumStatusMeta(undefined).variant).toBe("locked");
  });
});

describe("ALBUM_STATUS_FILTERS", () => {
  it("includes all four status variants", () => {
    expect(ALBUM_STATUS_FILTERS).toEqual(["active", "submitted", "locked", "delivered"]);
  });
});
