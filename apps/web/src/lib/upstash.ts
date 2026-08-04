// Shared Upstash Redis REST client for pipeline requests.
// Used by cache.ts and ratelimit.ts so both get per-command error checking.
//
// Configure with UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.

// This request is awaited on critical paths (login credential check, PIN
// verification) before those routes' own logic runs. Without a timeout, a
// hung endpoint (e.g. a blackholed TCP connection) would stall the request
// until the platform's own function timeout, never giving the catch-based
// degradation in cache.ts/ratelimit.ts a chance to kick in.
const UPSTASH_FETCH_TIMEOUT_MS = 1500;

interface PipelineItem {
  // MGET (used by cacheGetRaw) returns an array of strings/nulls, one per key.
  result?: string | number | null | Array<string | null>;
  error?: string;
}

export async function upstashPipeline(
  commands: Array<Array<string>>,
  url: string,
  token: string
): Promise<Array<PipelineItem>> {
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(UPSTASH_FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Upstash request failed (${res.status})`);
  }

  const items = (await res.json()) as Array<PipelineItem>;

  // Surface per-command errors so callers can treat them as cache/rate-limit
  // degradation rather than silently swallowing them.
  const firstError = items.find((item) => item.error)?.error;
  if (firstError) {
    throw new Error(`Upstash pipeline command failed: ${firstError}`);
  }

  return items;
}
