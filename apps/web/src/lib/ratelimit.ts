// Fixed-window rate limiter. Uses Upstash Redis (REST) when configured so the
// limit persists across serverless cold-starts and instances; otherwise falls
// back to an in-memory Map (per-instance, dev only — production without
// Upstash fails closed, since a per-instance limiter is trivially bypassed
// across serverless instances).
//
// Configure with UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (no SDK).

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const WINDOW_SECONDS = 15 * 60;

interface MemoryEntry {
  count: number;
  resetAt: number;
}

const memory = new Map<string, MemoryEntry>();

function memoryLimited(key: string, maxAttempts: number): boolean {
  const now = Date.now();
  const entry = memory.get(key);

  if (!entry || now > entry.resetAt) {
    memory.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  // Increment-then-compare, mirroring the Upstash INCR branch: both allow
  // maxAttempts requests and block the (maxAttempts + 1)-th.
  entry.count += 1;
  return entry.count > maxAttempts;
}

function memoryCount(key: string): number {
  const entry = memory.get(key);
  if (!entry || Date.now() > entry.resetAt) return 0;
  return entry.count;
}

function memoryRecord(key: string): void {
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || now > entry.resetAt) {
    memory.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

async function upstashPipeline(
  commands: Array<Array<string>>,
  url: string,
  token: string
): Promise<Array<{ result?: number | string | null }>> {
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

  return (await res.json()) as Array<{ result?: number | string | null }>;
}

async function upstashLimited(
  key: string,
  maxAttempts: number,
  url: string,
  token: string
): Promise<boolean> {
  // INCR the counter and set the TTL only on the first hit (EXPIRE ... NX).
  const data = await upstashPipeline(
    [
      ["INCR", `rl:${key}`],
      ["EXPIRE", `rl:${key}`, String(WINDOW_SECONDS), "NX"],
    ],
    url,
    token
  );
  const count = Number(data?.[0]?.result ?? 0);
  return count > maxAttempts;
}

export async function isRateLimited(key: string, maxAttempts: number): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    try {
      return await upstashLimited(key, maxAttempts, url, token);
    } catch (err) {
      console.warn("[RateLimit] Upstash unavailable; failing closed:", err);
      return true; // fail closed on infra error
    }
  }

  // The in-memory Map is per-instance and resets on cold start, so it is not
  // an effective limit on serverless. Only allow it outside production.
  if (import.meta.env.PROD) {
    console.error(
      "[RateLimit] UPSTASH_REDIS_REST_URL/TOKEN not configured in production; failing closed."
    );
    return true;
  }

  return memoryLimited(key, maxAttempts);
}

// Read-only check: true once the counter for `key` has reached `maxAttempts`.
// Does not increment — pair with `recordFailedAttempt` so only failures count.
export async function isLimitReached(key: string, maxAttempts: number): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    try {
      const data = await upstashPipeline([["GET", `rl:${key}`]], url, token);
      return Number(data?.[0]?.result ?? 0) >= maxAttempts;
    } catch (err) {
      console.warn("[RateLimit] Upstash unavailable; failing closed:", err);
      return true; // fail closed on infra error
    }
  }

  if (import.meta.env.PROD) {
    console.error(
      "[RateLimit] UPSTASH_REDIS_REST_URL/TOKEN not configured in production; failing closed."
    );
    return true;
  }

  return memoryCount(key) >= maxAttempts;
}

// Increment the counter for `key` (fixed 15-minute window). Errors are logged
// and swallowed: the paired `isLimitReached` already fails closed on outages.
export async function recordFailedAttempt(key: string): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    try {
      await upstashPipeline(
        [
          ["INCR", `rl:${key}`],
          ["EXPIRE", `rl:${key}`, String(WINDOW_SECONDS), "NX"],
        ],
        url,
        token
      );
    } catch (err) {
      console.warn("[RateLimit] Upstash unavailable; failed attempt not recorded:", err);
    }
    return;
  }

  if (!import.meta.env.PROD) {
    memoryRecord(key);
  }
}

export const RATE_LIMIT_RETRY_AFTER = String(WINDOW_SECONDS);
