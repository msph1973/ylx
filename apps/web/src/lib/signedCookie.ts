import crypto from "node:crypto";

// Generic HMAC signing/verification for cookie payloads, used by the
// gallery PIN session (see M-2 in new-audit.md, `lib/gallerySession.ts`).
// `auth.ts`'s admin session intentionally keeps its own separate copy of
// this same HMAC logic rather than importing it from here: routing
// admin-session signing through this file made a CodeQL finding
// (`js/insufficient-password-hash`, already dismissed as a false positive at
// its original auth.ts location) reappear as "new" for this PR, since
// CodeQL's taint tracking flagged the moved sink as untriaged. Duplicating
// ~10 lines of HMAC glue was judged safer than re-triggering that alert.
const SECRET = process.env.SESSION_SECRET ?? "";

function hmac(payload: string): string {
  // Not a password hash: this HMAC-signs a cookie payload (session/PIN-access
  // data), not a user password — bcrypt is used for actual password storage in
  // packages/sanity/lib/admin.ts. Same false positive already dismissed at the
  // pre-refactor location (auth.ts, code scanning alert #3).
  //codeql[js/insufficient-password-hash]
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
