import { sanityClient } from "@ylx/sanity/client";

const CUSTOM_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function generateUniqueSlug(
  title: string,
  excludeId?: string,
  customSlug?: string,
): Promise<string> {
  if (customSlug && CUSTOM_SLUG_RE.test(customSlug)) {
    const query = excludeId
      ? `count(*[_type == "album" && (slug.current == $slug || customSlug == $customSlug) && _id != $id])`
      : `count(*[_type == "album" && (slug.current == $slug || customSlug == $customSlug)])`;
    const params = excludeId
      ? { slug: customSlug, customSlug, id: excludeId }
      : { slug: customSlug, customSlug };

    const count = await sanityClient.fetch<number>(query, params);
    if (count === 0) return customSlug;
  }

  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    || `album-${Date.now().toString(36)}`;

  const query = excludeId
    ? `*[_type == "album" && slug.current == $slug && _id != $id]{_id}`
    : `*[_type == "album" && slug.current == $slug]{_id}`;
  const params = excludeId ? { slug: base, id: excludeId } : { slug: base };

  const existing = await sanityClient.fetch<{ _id: string }[]>(query, params);
  return existing.length > 0 ? `${base}-${Date.now().toString(36)}` : base;
}
