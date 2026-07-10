import { sanityClient } from "@ylx/sanity/client";

// Shared with the `customSlug` field validation in packages/sanity/schemas/album.ts.
export const CUSTOM_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugBaseFromTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `album-${Date.now().toString(36)}`
  );
}

async function countAlbumsUsingSlug(slug: string, excludeId?: string): Promise<number> {
  const query = excludeId
    ? "count(*[_type == 'album' && slug.current == $slug && _id != $id])"
    : "count(*[_type == 'album' && slug.current == $slug])";
  const params = excludeId ? { slug, id: excludeId } : { slug };
  return sanityClient.fetch<number>(query, params);
}

/** Auto-generates a URL-safe slug from the album title, appended with a
 *  timestamp suffix only on collision. This is always `album.slug.current`
 *  — unrelated to the separate, admin-chosen `customSlug` field below. */
export async function generateUniqueSlug(title: string, excludeId?: string): Promise<string> {
  const base = slugBaseFromTitle(title);
  const collisionCount = await countAlbumsUsingSlug(base, excludeId);
  return collisionCount > 0 ? `${base}-${Date.now().toString(36)}` : base;
}

/** Validates format and checks uniqueness of an admin-provided custom slug
 *  against every album's `slug.current` AND `customSlug` (both resolve a
 *  gallery URL, so a custom slug must not collide with either). Returns
 *  `null` when the value is malformed or already taken by another album. */
export async function resolveCustomSlug(customSlug: string, excludeId?: string): Promise<string | null> {
  if (!CUSTOM_SLUG_RE.test(customSlug)) return null;

  const query = excludeId
    ? "count(*[_type == 'album' && (slug.current == $slug || customSlug == $slug) && _id != $id])"
    : "count(*[_type == 'album' && (slug.current == $slug || customSlug == $slug)])";
  const params = excludeId ? { slug: customSlug, id: excludeId } : { slug: customSlug };

  const count = await sanityClient.fetch<number>(query, params);
  return count === 0 ? customSlug : null;
}
