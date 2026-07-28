import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchResumeSession } from "./gallerySessionClient";

const ALBUM = { id: "a1", title: "T", clientName: "C", eventDate: "2026-08-01", status: "active", maxSelections: 10, photos: [] };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetchResumeSession", () => {
  it("returns the album on a 200 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ album: ALBUM }), { status: 200 })
    ));
    await expect(fetchResumeSession("slug")).resolves.toEqual(ALBUM);
  });

  it("returns null on a 401 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "no session" }), { status: 401 })
    ));
    await expect(fetchResumeSession("slug")).resolves.toBeNull();
  });

  it("returns null when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(fetchResumeSession("slug")).resolves.toBeNull();
  });

  it("returns null on malformed JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{oops", { status: 200 })));
    await expect(fetchResumeSession("slug")).resolves.toBeNull();
  });

  it("aborts a stalled request after the timeout instead of hanging", async () => {
    vi.useFakeTimers();
    // A fetch that only settles when its abort signal fires.
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      })
    ));

    const promise = fetchResumeSession("slug", 5000);
    await vi.advanceTimersByTimeAsync(5001);
    await expect(promise).resolves.toBeNull();
  });
});
