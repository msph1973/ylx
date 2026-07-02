import { sanityClient } from "@ylx/sanity/client";

export async function generateUniqueSlug(title: string, excludeId?: string): Promise<string> {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    || `album-${Date.now().toString(36)}`; // fallback for emoji/non-Latin-only titles

  const query = excludeId
    ? `*[_type == "album" && slug.current == $slug && _id != $id]{_id}`
    : `*[_type == "album" && slug.current == $slug]{_id}`;
  const params = excludeId ? { slug: base, id: excludeId } : { slug: base };

  const existing = await sanityClient.fetch<{ _id: string }[]>(query, params);
  return existing.length > 0 ? `${base}-${Date.now().toString(36)}` : base;
}
