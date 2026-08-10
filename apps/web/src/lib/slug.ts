import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";
import { CUSTOM_SLUG_PATTERN } from "@ylx/sanity/lib/constants";
import { captureError } from "./errorTracking";

function slugBaseFromTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `album-${Date.now().toString(36)}`
  );
}

/** `slugLock` is an internal document type whose `_id` is deterministically
 *  derived from a slug/customSlug value. Sanity has no native unique-field
 *  constraint, but document IDs ARE guaranteed unique and `.create()` (unlike
 *  `.createIfNotExists()`) atomically fails with a 409 if the ID already
 *  exists — so this reuses that guarantee as a race-free "reserve this slug"
 *  primitive instead of the previous check-then-write (count query, then a
 *  separate patch/create) which let two concurrent requests both pass the
 *  count check and both write the same slug. */
export function slugLockId(slug: string): string {
  return `slugLock.${slug}`;
}

function isConflictError(err: unknown): boolean {
  const statusCode =
    (err as { statusCode?: number }).statusCode ??
    (err as { response?: { statusCode?: number } }).response?.statusCode;
  return statusCode === 409;
}

/** Atomically reserves `slug` for `albumId`. Returns `true` if reserved (or
 *  already owned by this same album — e.g. re-saving an album without
 *  actually changing its slug), `false` if genuinely held by another album. */
async function reserveSlug(slug: string, albumId: string): Promise<boolean> {
  const lockId = slugLockId(slug);
  try {
    await sanityWriteClient.create({ _id: lockId, _type: "slugLock", slug, albumId });
  } catch (err) {
    if (!isConflictError(err)) throw err;
    const existing = await sanityClient.fetch<{ albumId?: string } | null>(
      "*[_type == 'slugLock' && _id == $id][0]{albumId}",
      { id: lockId }
    );
    return existing?.albumId === albumId;
  }

  // The lock was just created for the very first time — but albums created
  // before this locking mechanism existed have no matching lock document.
  // Guard against a brand-new slug silently colliding with one of those
  // legacy slugs. This isn't racy: it reads already-committed data, and the
  // lock created above already serializes any concurrent attempt to claim
  // this exact value going forward.
  const legacyOwnerId = await sanityClient.fetch<string | null>(
    "*[_type == 'album' && (slug.current == $slug || customSlug == $slug) && _id != $albumId][0]._id",
    { slug, albumId }
  );
  if (legacyOwnerId) {
    await releaseSlugLock(slug);
    return false;
  }
  return true;
}

/** Best-effort release of a no-longer-needed slug lock (e.g. the old slug
 *  after a rename). Failure here only leaves that exact string unavailable
 *  for reuse — an availability inconvenience, not a uniqueness/correctness
 *  bug — so it's logged and swallowed rather than propagated. Reported here
 *  (not by callers) since this function never rejects — a `try/catch` around
 *  a call to it can never actually observe a failure. */
export async function releaseSlugLock(slug: string | undefined): Promise<void> {
  if (!slug) return;
  try {
    await sanityWriteClient.delete(slugLockId(slug));
  } catch (err) {
    console.warn(`[Slug] Failed to release lock for "${slug}":`, err);
    captureError(err, { route: "releaseSlugLock", slug });
  }
}

/** Auto-generates a URL-safe slug from the album title, appended with a
 *  timestamp suffix only on collision. This is always `album.slug.current`
 *  — unrelated to the separate, admin-chosen `customSlug` field below.
 *  `albumId` must be stable for the album being created/edited (the caller
 *  pre-generates it for new albums) so ownership can be checked atomically.
 *  `previousSlug` (edits only) is released once the new one is secured. */
export async function generateUniqueSlug(
  title: string,
  albumId: string,
  previousSlug?: string
): Promise<string> {
  const base = slugBaseFromTitle(title);

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${Date.now().toString(36)}-${attempt}`;
    if (await reserveSlug(candidate, albumId)) {
      if (previousSlug && previousSlug !== candidate) {
        await releaseSlugLock(previousSlug);
      }
      return candidate;
    }
  }
  throw new Error(`Could not generate a unique slug for "${title}" after multiple attempts`);
}

/** Validates format and atomically reserves an admin-provided custom slug
 *  against every album's `slug.current` AND `customSlug` (both resolve a
 *  gallery URL, so a custom slug must not collide with either). Returns
 *  `null` when the value is malformed or already taken by another album.
 *  `previousCustomSlug` (edits only) is released once the new one is secured. */
export async function resolveCustomSlug(
  customSlug: string,
  albumId: string,
  previousCustomSlug?: string
): Promise<string | null> {
  if (!CUSTOM_SLUG_PATTERN.test(customSlug)) return null;

  const reserved = await reserveSlug(customSlug, albumId);
  if (!reserved) return null;

  if (previousCustomSlug && previousCustomSlug !== customSlug) {
    await releaseSlugLock(previousCustomSlug);
  }
  return customSlug;
}
