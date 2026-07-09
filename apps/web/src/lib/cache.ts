// Stale-while-revalidate cache for read-heavy Sanity queries. Uses Upstash
// Redis (REST) when configured, same raw-fetch style as `ratelimit.ts`.
//
// Unlike `ratelimit.ts` this is a PERFORMANCE optimization, not a security
// control, so it fails OPEN: any missing config or Upstash error just falls
// back to calling the fetcher directly — never throws, never blocks the
// request.
//
// Configure with UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (no SDK).

interface CacheEnvelope<T> {
  storedAt: number;
  value: T;
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

export async function getCached<T>(
  key: string,
  ttlSeconds: number,
  staleTtlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return fetcher();
  }

  try {
    const data = await upstashPipeline([["GET", key]], url, token);
    const raw = data?.[0]?.result;

    if (raw) {
      const envelope = JSON.parse(raw) as CacheEnvelope<T>;
      const ageMs = Date.now() - envelope.storedAt;

      if (ageMs <= ttlSeconds * 1000) {
        return envelope.value; // fresh
      }

      // Stale but usable: return immediately, refresh in background.
      void fetcher()
        .then((fresh) => storeInCache(key, fresh, staleTtlSeconds, url, token))
        .catch((err) => console.warn("[Cache] background refresh failed:", err));
      return envelope.value;
    }
  } catch (err) {
    console.warn("[Cache] Upstash unavailable; falling back to direct fetch:", err);
    return fetcher();
  }

  // Hard miss: fetch, store, return.
  const fresh = await fetcher();
  try {
    await storeInCache(key, fresh, staleTtlSeconds, url, token);
  } catch (err) {
    console.warn("[Cache] failed to store value; continuing without cache:", err);
  }
  return fresh;
}

export async function invalidateCache(key: string): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return;

  try {
    await upstashPipeline([["DEL", key]], url, token);
  } catch (err) {
    console.warn("[Cache] invalidation failed:", err);
  }
}

// Key-builder helpers so call sites stay consistent.
export const CACHE_KEYS = {
  albumsList: (): string => "cache:admin:albums:list",
  albumSelections: (albumId: string): string => `cache:admin:selections:${albumId}`,
};
