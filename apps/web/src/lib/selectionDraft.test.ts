import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { saveDraft, loadDraft, clearDraft } from "./selectionDraft";

const ALBUM = "album-1";
const KEY = `ylx:draft:${ALBUM}`;
const PHOTOS = ["p1", "p2", "p3"];

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("saveDraft / loadDraft roundtrip", () => {
  it("persists and restores photo ids and notes", () => {
    saveDraft(ALBUM, ["p1", "p3"], { p1: "crop this" });

    const draft = loadDraft(ALBUM, PHOTOS, 10);
    expect(draft?.photoIds).toEqual(["p1", "p3"]);
    expect(draft?.notes).toEqual({ p1: "crop this" });
  });

  it("removes the stored draft when saving an empty selection with no notes", () => {
    saveDraft(ALBUM, ["p1"], {});
    saveDraft(ALBUM, [], {});
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});

describe("loadDraft cleaning", () => {
  it("drops photo ids that no longer exist in the album", () => {
    saveDraft(ALBUM, ["p1", "deleted-photo", "p2"], {});
    expect(loadDraft(ALBUM, PHOTOS, 10)?.photoIds).toEqual(["p1", "p2"]);
  });

  it("clamps the selection to maxSelections", () => {
    saveDraft(ALBUM, ["p1", "p2", "p3"], {});
    expect(loadDraft(ALBUM, PHOTOS, 2)?.photoIds).toEqual(["p1", "p2"]);
  });

  it("discards notes for photos that are not in the restored selection", () => {
    saveDraft(ALBUM, ["p1"], { p1: "keep", p2: "orphan", ghost: "gone" });
    expect(loadDraft(ALBUM, PHOTOS, 10)?.notes).toEqual({ p1: "keep" });
  });

  it("returns null when nothing valid remains", () => {
    saveDraft(ALBUM, ["deleted-photo"], {});
    expect(loadDraft(ALBUM, PHOTOS, 10)).toBeNull();
  });
});

describe("loadDraft robustness", () => {
  it("returns null when no draft exists", () => {
    expect(loadDraft(ALBUM, PHOTOS, 10)).toBeNull();
  });

  it("discards corrupt JSON and returns null", () => {
    window.localStorage.setItem(KEY, "{not json");
    expect(loadDraft(ALBUM, PHOTOS, 10)).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("discards a draft with the wrong shape", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ photoIds: "p1", notes: null, savedAt: "x" }));
    expect(loadDraft(ALBUM, PHOTOS, 10)).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("discards a draft older than 24 hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T00:00:00Z"));
    saveDraft(ALBUM, ["p1"], {});
    vi.setSystemTime(new Date("2026-07-28T00:00:01Z"));
    expect(loadDraft(ALBUM, PHOTOS, 10)).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});

describe("clearDraft", () => {
  it("removes the draft", () => {
    saveDraft(ALBUM, ["p1"], {});
    clearDraft(ALBUM);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});
