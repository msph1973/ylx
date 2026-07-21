// Stale-while-revalidate cache for read-heavy Sanity queries. Uses Upstash
// Redis (REST) when configured, same raw-fetch style as `ratelimit.ts`.
//
// Unlike `ratelimit.ts` this is a PERFORMANCE optimization, not a security
// control, so it fails OPEN: any missing config or Upstash error just falls
// back to calling the fetcher directly — never throws, never blocks the
// request.
//
// Configure with UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (no SDK).

import { waitUntil } from "@vercel/functions";

interface CacheEnvelope<T> {
  storedAt: number;
  value: T;
}

// Simple in-memory health signal for the cache layer. This module has no metrics/
// alerting integration (the app has none anywhere yet), so this is a minimal,
// zero-dependency way for a future health-check endpoint or manual debugging to
// detect "is the cache currently degraded" without changing getCached()'s return
// shape (which 3 existing callers already depend on).
let cacheFailureCount = 0;

export function getCacheHealth(): { degraded: boolean; failureCount: number } {
  return { degraded: cacheFailureCount > 0, failureCount: cacheFailureCount };
}

async function upstashPipeline(
  commands: Array<Array<string>>,
  url: string,
  token: string
): Promise<Array<{ result?: string | null }>> {
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });

  if (!res.ok) {
    throw new Error(`Upstash request failed (${res.status})`);
  }

  return (await res.json()) as Array<{ result?: string | null }>;
}

async function storeInCache<T>(
  key: string,
  value: T,
  staleTtlSeconds: number,
  url: string,
  token: string
): Promise<void> {
  const envelope: CacheEnvelope<T> = { storedAt: Date.now(), value };
  await upstashPipeline(
    [["SET", key, JSON.stringify(envelope), "EX", String(staleTtlSeconds)]],
    url,
    token
  );
}

// Background refreshes in flight, keyed by cache key. Without this, every
// concurrent request that observes the same stale entry would kick off its
// own upstream fetch; this collapses them into one.
const inFlightRefreshes = new Map<string, Promise<void>>();

function refreshInBackground<T>(
  key: string,
  fetcher: () => Promise<T>,
  staleTtlSeconds: number,
  url: string,
  token: string
): void {
  if (inFlightRefreshes.has(key)) return;

  const refresh = fetcher()
    .then((fresh) => storeInCache(key, fresh, staleTtlSeconds, url, token))
    .catch((err) => console.warn(`[Cache] background refresh failed for "${key}":`, err))
    .finally(() => inFlightRefreshes.delete(key));

  inFlightRefreshes.set(key, refresh);

  // On Vercel Serverless the runtime can freeze right after the response is
  // sent, killing this refresh mid-flight. waitUntil() keeps the function
  // alive until it settles; outside Vercel it's a harmless no-op wrapper
  // around the same promise, so this is safe in dev/tests too.
  try {
    waitUntil(refresh);
  } catch (err) {
    console.warn(`[Cache] waitUntil unavailable for "${key}" background refresh:`, err);
  }
}

export async function getCached<T>(
  key: string,
  ttlSeconds: number,
  staleTtlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return await fetcher();
  }

  try {
    const data = await upstashPipeline([["GET", key]], url, token);
    const raw = data?.[0]?.result;

    if (raw) {
      let envelope: CacheEnvelope<T> | undefined;
      try {
        envelope = JSON.parse(raw) as CacheEnvelope<T>;
      } catch (parseErr) {
        // Corrupted entry: drop it so the cache self-heals instead of
        // failing to parse on every request until it expires.
        console.warn(`[Cache] corrupted entry for "${key}"; discarding and treating as hard miss:`, parseErr);
        void invalidateCache(key);
      }

      if (envelope) {
        const ageMs = Date.now() - envelope.storedAt;

        if (ageMs <= ttlSeconds * 1000) {
          return envelope.value; // fresh
        }

        // Stale but usable: return immediately, refresh in background.
        refreshInBackground(key, fetcher, staleTtlSeconds, url, token);
        return envelope.value;
      }
    }
  } catch (err) {
    cacheFailureCount++; // feeds getCacheHealth(): Upstash request itself failed
    console.warn(`[Cache] Upstash GET unavailable for "${key}"; falling back to direct fetch:`, err);
    return await fetcher();
  }

  // Hard miss: fetch, store, return. If fetcher throws here there is no cached
  // value to fall back to, so we let it propagate — the caller gets the error.
  const fresh = await fetcher();
  void storeInCache(key, fresh, staleTtlSeconds, url, token).catch((err) => {
    console.warn(`[Cache] failed to store value for "${key}"; continuing without cache:`, err);
  });
  return fresh;
}

export async function invalidateCache(keys: string | string[]): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return;

  const keyList = Array.isArray(keys) ? keys : [keys];
  if (keyList.length === 0) return;

  try {
    // A single DEL with every key is one Upstash round-trip instead of one
    // per key, which matters for bulk operations (e.g. deleting N albums).
    await upstashPipeline([["DEL", ...keyList]], url, token);
  } catch (err) {
    cacheFailureCount++; // feeds getCacheHealth(): Upstash request itself failed
    console.warn(`[Cache] invalidation failed for [${keyList.join(", ")}]:`, err);
  }
}

// Key-builder helpers so call sites stay consistent.
export const CACHE_KEYS = {
  albumsList: (): string => "cache:admin:albums:list",
  albumSelections: (albumId: string): string => `cache:admin:selections:${albumId}`,
  adminSessionVersion: (adminId: string): string => `cache:admin:session-version:${adminId}`,
};
