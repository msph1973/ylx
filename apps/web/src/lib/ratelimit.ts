// Fixed-window rate limiter. Uses Upstash Redis (REST) when configured so the
// limit persists across serverless cold-starts and instances; otherwise falls
// back to an in-memory Map (per-instance, resets on cold-start).
//
// Configure with UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (no SDK).

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const WINDOW_SECONDS = 15 * 60;

interface MemoryEntry {
  count: number;
  resetAt: number;
}

const memory = new Map<string, MemoryEntry>();

function memoryLimited(key: string): boolean {
  const now = Date.now();
  const entry = memory.get(key);

  if (!entry || now > entry.resetAt) {
    memory.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  // Increment-then-compare, mirroring the Upstash INCR branch: both allow
  // MAX_ATTEMPTS requests and block the (MAX_ATTEMPTS + 1)-th.
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

async function upstashLimited(key: string, url: string, token: string): Promise<boolean> {
  // INCR the counter and set the TTL only on the first hit (EXPIRE ... NX).
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", `rl:${key}`],
      ["EXPIRE", `rl:${key}`, String(WINDOW_SECONDS), "NX"],
    ]),
  });

  // Fail open: a limiter outage must not lock out legitimate clients.
  if (!res.ok) {
    console.warn(`[RateLimit] Upstash request failed (${res.status}); failing open.`);
    return false;
  }

  const data = (await res.json()) as Array<{ result?: number }>;
  const count = Number(data?.[0]?.result ?? 0);
  return count > MAX_ATTEMPTS;
}

export async function isRateLimited(key: string): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    try {
      return await upstashLimited(key, url, token);
    } catch (err) {
      console.warn("[RateLimit] Upstash unavailable; failing open:", err);
      return false; // fail open on infra error
    }
  }

  return memoryLimited(key);
}

export const RATE_LIMIT_RETRY_AFTER = String(WINDOW_SECONDS);
