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
import { upstashPipeline } from "./upstash";

interface CacheEnvelope<T> {
  storedAt: number;
  value: T;
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

// Fetches in flight, keyed by cache key. Covers BOTH a background
// stale-while-revalidate refresh AND a hard cache-miss (cold start, or right
// after invalidateCache()) — without this, every concurrent request that
// observes the same stale-or-missing entry would kick off its own upstream
// fetch; this collapses them all into one shared promise that every caller
// awaits/observes instead.
//
// Value type is `unknown` because this single module-level map is shared
// across every `getCached<T>()` call regardless of T; callers cast back to
// their own `Promise<T>`, which is safe since the cache `key` already keeps
// distinct logical values from colliding with each other.
const inFlightFetches = new Map<string, Promise<unknown>>();

// Kicks off (or reuses) a single in-flight fetch for `key` so concurrent
// callers racing the same stale-or-missing entry share one upstream call
// instead of each starting their own. `onFetched` runs only for whichever
// caller actually created the in-flight entry (never for one that merely
// piggybacks on it), so a fresh value is only ever stored once per fetch.
//
// `awaitStore` controls whether the returned promise waits for the
// `onFetched` (cache-store) write to finish:
//   - Background stale-while-revalidate refreshes pass `true` so the Vercel
//     `waitUntil()` wrapper genuinely waits for the store before the function
//     is frozen — integration with `refreshInBackground` below depends on it.
//   - A hard cache-miss (cold start / just-invalidated) passes `false` so a
//     slow or unavailable Upstash write never adds its timeout to the
//     user-visible latency of a fresh-fetch path; the store still fires, just
//     detached from the value the caller receives.
function dedupedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  onFetched: (fresh: T) => void | Promise<void>,
  awaitStore: boolean
): Promise<T> {
  const existing = inFlightFetches.get(key);
  if (existing) return existing as Promise<T>;

  const store = (fresh: T) =>
    Promise.resolve(onFetched(fresh)).catch((err) => {
      console.warn(`[Cache] failed to store value for "${key}"; continuing without cache:`, err);
    });

  const inFlight = fetcher()
    .then(async (fresh) => {
      const write = store(fresh);
      return awaitStore ? await write.then(() => fresh) : fresh;
    })
    .finally(() => inFlightFetches.delete(key));

  inFlightFetches.set(key, inFlight);
  return inFlight;
}

function refreshInBackground<T>(
  key: string,
  fetcher: () => Promise<T>,
  staleTtlSeconds: number,
  url: string,
  token: string
): void {
  if (inFlightFetches.has(key)) return;

  const refresh = dedupedFetch(key, fetcher, (fresh) =>
    storeInCache(key, fresh, staleTtlSeconds, url, token).catch((err) => {
      console.warn(`[Cache] background refresh cache-store failed for "${key}":`, err);
    }),
    true
  ).catch((err) => {
    console.warn(`[Cache] background refresh fetch failed for "${key}":`, err);
  });

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

    if (typeof raw === "string") {
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
    console.warn(`[Cache] Upstash GET unavailable for "${key}"; falling back to direct fetch:`, err);
    return await fetcher();
  }

  // Hard miss: fetch, store, return (store detached — see dedupedFetch's
  // `awaitStore=false`). Deduped via the same in-flight map as background
  // refreshes, so N concurrent requests racing a cold key (e.g. right after
  // invalidateCache()) share one upstream fetch instead of each calling the
  // fetcher themselves. If the fetcher throws here there is no cached value
  // to fall back to, so it still propagates — every caller sharing this
  // in-flight fetch gets the same error.
  return dedupedFetch(key, fetcher, (fresh) =>
    storeInCache(key, fresh, staleTtlSeconds, url, token).catch((err) => {
      console.warn(`[Cache] failed to store value for "${key}"; continuing without cache:`, err);
    }),
    false
  );
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
    console.warn(`[Cache] invalidation failed for [${keyList.join(", ")}]:`, err);
  }
}

// Key-builder helpers so call sites stay consistent.
export const CACHE_KEYS = {
  albumsList: (): string => "cache:admin:albums:list",
  albumSelections: (albumId: string): string => `cache:admin:selections:${albumId}`,
  albumBySlug: (slug: string): string => `cache:gallery:album:${slug}`,
  adminSessionVersion: (adminId: string): string => `cache:admin:session-version:${adminId}`,
  galleryDraft: (albumId: string): string => `draft:gallery:${albumId}`,
};

// Raw key/value helpers for small ephemeral state (e.g. gallery draft
// progress) — no SWR envelope semantics, just SET-with-TTL and MGET. Same
// fail-open contract as the SWR cache: missing config or Upstash errors
// degrade to no-ops/nulls, never throw.

export async function cacheSetRaw<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;

  try {
    await upstashPipeline(
      [["SET", key, JSON.stringify(value), "EX", String(ttlSeconds)]],
      url,
      token
    );
  } catch (err) {
    console.warn(`[Cache] raw SET failed for "${key}":`, err);
  }
}

// One MGET round-trip for N keys; result[i] corresponds to keys[i] and is
// null when the key is missing, unparsable, or Upstash is unavailable.
export async function cacheGetRaw<T>(keys: string[]): Promise<Array<T | null>> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || keys.length === 0) return keys.map(() => null);

  try {
    const data = await upstashPipeline([["MGET", ...keys]], url, token);
    const results = data?.[0]?.result;
    if (!Array.isArray(results)) return keys.map(() => null);
    return keys.map((_, i) => {
      const raw = results[i];
      if (typeof raw !== "string") return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    });
  } catch (err) {
    console.warn(`[Cache] raw MGET failed for [${keys.join(", ")}]:`, err);
    return keys.map(() => null);
  }
}
