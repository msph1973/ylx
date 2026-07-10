// Fixed-window rate limiter. Uses Upstash Redis (REST) when configured so the
// limit persists across serverless cold-starts and instances; otherwise falls
// back to an in-memory Map (per-instance).  In production without Upstash the
// in-memory fallback is still applied with a tighter cap — it is not
// effective across instances, but it prevents a total bypass of rate limiting
// when the backing store is temporarily unavailable.
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

// In-memory limits are per-instance and reset on cold start, so they are not
// an effective rate limit across serverless instances.  When Upstash is
// unavailable in production (M-4), degrade to a tighter in-memory cap rather
// than failing closed and blocking all traffic — the reduced cap (half of the
// normal limit) still throttles brute-force attempts while avoiding a
// self-inflicted DoS if Upstash has an outage.
const IN_MEMORY_PROD_CAP_DIVISOR = 2;

export async function isRateLimited(key: string, maxAttempts: number): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    try {
      return await upstashLimited(key, maxAttempts, url, token);
    } catch (err) {
      console.warn("[RateLimit] Upstash unavailable; degrading to in-memory:", err);
    }
  }

  // In production without Upstash, use in-memory with a tighter cap.
  const cap = import.meta.env.PROD
    ? Math.max(1, Math.floor(maxAttempts / IN_MEMORY_PROD_CAP_DIVISOR))
    : maxAttempts;
  return memoryLimited(key, cap);
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
      console.warn("[RateLimit] Upstash unavailable; degrading to in-memory:", err);
    }
  }

  const cap = import.meta.env.PROD
    ? Math.max(1, Math.floor(maxAttempts / IN_MEMORY_PROD_CAP_DIVISOR))
    : maxAttempts;
  return memoryCount(key) >= cap;
}

// Increment the counter for `key` (fixed 15-minute window). Errors are logged
// and swallowed: the paired `isLimitReached` already handles degradation.
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
      console.warn("[RateLimit] Upstash unavailable; recording to in-memory fallback:", err);
      memoryRecord(key);
    }
    return;
  }

  memoryRecord(key);
}

export const RATE_LIMIT_RETRY_AFTER = String(WINDOW_SECONDS);
