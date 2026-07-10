import crypto from "node:crypto";

// Shared HMAC signing/verification for cookie payloads — extracted from
// `auth.ts` so the gallery PIN session (see M-2 in new-audit.md) doesn't
// duplicate the same crypto primitives.
const SECRET = process.env.SESSION_SECRET ?? "";

function hmac(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

// Sign `data` as `<base64url(json)>.<hmac>`. Fails fast if SESSION_SECRET is
// missing so misconfiguration surfaces immediately instead of issuing a
// cookie that `verify()` can never validate.
export function sign<T>(data: T): string {
  if (!SECRET) {
    throw new Error("SESSION_SECRET environment variable is not set");
  }
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

// Verify a `sign()`-produced value in constant time and return the parsed
// payload, or `null` if the value is missing, malformed, unsigned, or the
// secret isn't configured.
export function verify<T>(value: string | undefined | null): T | null {
  if (!value || !SECRET) {
    return null;
  }

  const [payload, signature] = value.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expected = hmac(payload);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
