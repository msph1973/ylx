import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// cache.ts's stampede protection is exercised against a mocked Upstash
// pipeline (same pattern as auth.test.ts mocking the Sanity lookup) so this
// file never needs a real Redis instance.
const upstashPipelineMock = vi.fn();

vi.mock("./upstash", () => ({
  upstashPipeline: (...args: unknown[]) => upstashPipelineMock(...args),
}));

const ORIGINAL_ENV = { ...process.env };

function mockAlwaysHardMiss(): void {
  upstashPipelineMock.mockImplementation(async (commands: Array<Array<string>>) => {
    const [command] = commands;
    if (command[0] === "GET") return [{ result: null }];
    return [{ result: "OK" }];
  });
}

beforeEach(() => {
  vi.resetModules();
  upstashPipelineMock.mockReset();
  process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("getCached — hard-miss stampede protection", () => {
  it("dedupes concurrent hard-miss requests for the same key into a single fetcher() call", async () => {
    const { getCached } = await import("./cache");
    mockAlwaysHardMiss();

    let fetcherCalls = 0;
    const fetcher = vi.fn(async () => {
      fetcherCalls += 1;
      // Give the other concurrent callers a chance to race in before this settles.
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { value: "fresh" };
    });

    const results = await Promise.all([
      getCached("cache:test:key", 20, 60, fetcher),
      getCached("cache:test:key", 20, 60, fetcher),
      getCached("cache:test:key", 20, 60, fetcher),
    ]);

    expect(fetcherCalls).toBe(1);
    expect(results).toEqual([{ value: "fresh" }, { value: "fresh" }, { value: "fresh" }]);
  });

  it("calls the fetcher again for a later, non-concurrent hard miss once the in-flight entry has cleared", async () => {
    const { getCached } = await import("./cache");
    mockAlwaysHardMiss();

    const fetcher = vi.fn().mockResolvedValue({ value: "fresh" });

    await getCached("cache:test:key-2", 20, 60, fetcher);
    await getCached("cache:test:key-2", 20, 60, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("propagates a fetcher rejection to every concurrent caller sharing the in-flight hard-miss fetch", async () => {
    const { getCached } = await import("./cache");
    mockAlwaysHardMiss();
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const fetcher = vi.fn().mockRejectedValue(new Error("Sanity is down"));

    const results = await Promise.allSettled([
      getCached("cache:test:key-3", 20, 60, fetcher),
      getCached("cache:test:key-3", 20, 60, fetcher),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(results[0].status).toBe("rejected");
    expect(results[1].status).toBe("rejected");
  });

  it("does not dedupe when Upstash isn't configured (unrelated fail-open path, unchanged by this fix)", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const { getCached } = await import("./cache");

    let fetcherCalls = 0;
    const fetcher = vi.fn(async () => {
      fetcherCalls += 1;
      return { value: "direct" };
    });

    const results = await Promise.all([
      getCached("cache:test:no-upstash", 20, 60, fetcher),
      getCached("cache:test:no-upstash", 20, 60, fetcher),
    ]);

    // Without Upstash configured, getCached() always calls the fetcher
    // directly (fail-open, no cache involved at all) — each call is
    // independent by design, so both calls hit the fetcher.
    expect(fetcherCalls).toBe(2);
    expect(results).toEqual([{ value: "direct" }, { value: "direct" }]);
  });
});
