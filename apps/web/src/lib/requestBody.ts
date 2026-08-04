// Shared request-body parsing for Astro API routes.
//
// Prior to PR #86 each route that needs a JSON body had its own copy of this
// helper. Centralizing it keeps the parsing (and the "clean 400 instead of a
// raw 500 on malformed/non-object JSON" contract) in one place.

/** Parses a request body as JSON and ensures it's a plain object (not an
 *  array, null, or a primitive) — callers get a clean 400 instead of the raw
 *  500 a malformed/non-JSON body would otherwise cause. The type parameter
 *  lets callers narrow the result (e.g. `parseJsonBody<BulkDeleteBody>`). */
export async function parseJsonBody<T = Record<string, unknown>>(
  request: Request
): Promise<T | null> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  return parsed as T;
}