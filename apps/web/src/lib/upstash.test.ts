import { describe, it, expect, vi, afterEach } from "vitest";
import { upstashPipeline } from "./upstash";

describe("upstashPipeline", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("aborts via a timeout signal, so a hung endpoint degrades fast instead of stalling until the platform's own function timeout", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ result: "OK" }],
    });
    vi.stubGlobal("fetch", fetchMock);

    await upstashPipeline([["GET", "some-key"]], "https://example.upstash.io", "test-token");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("surfaces a per-command error as a thrown Error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ error: "WRONGTYPE" }],
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      upstashPipeline([["GET", "some-key"]], "https://example.upstash.io", "test-token")
    ).rejects.toThrow("Upstash pipeline command failed: WRONGTYPE");
  });

  it("throws when the HTTP response isn't ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      upstashPipeline([["GET", "some-key"]], "https://example.upstash.io", "test-token")
    ).rejects.toThrow("Upstash request failed (500)");
  });

  it("passes a signal that is not already aborted, and rejects if fetch itself rejects with an AbortError (what a firing timeout looks like from the caller's side)", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      // This is exactly what a real `fetch` does once the `AbortSignal`
      // passed to it fires: it rejects with an AbortError instead of ever
      // resolving. `upstashPipeline` doesn't need to do anything special to
      // handle it — the rejection just propagates like any other fetch
      // failure, which is what actually makes the fail-fast behavior work.
      expect(init?.signal?.aborted).toBe(false);
      return Promise.reject(new DOMException("This operation was aborted", "AbortError"));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      upstashPipeline([["GET", "some-key"]], "https://example.upstash.io", "test-token")
    ).rejects.toThrow("This operation was aborted");
  });
});
