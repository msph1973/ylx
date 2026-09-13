import { sanityWriteClient } from "@ylx/sanity/client";
import { CACHE_KEYS, invalidateCache } from "./cache";

// Bust every gallery slug-cache entry for one vendor's albums. Brand and
// display-name changes render server-side in galleries, so without this the
// old identity lingers until TTL expiry. Shared by the superadmin vendor
// editor and the vendor self-service profile endpoint.
export async function invalidateVendorGalleries(ownerId: string): Promise<void> {
  const slugs = await sanityWriteClient.fetch<{ slug?: { current: string }; customSlug?: string }[]>(
    `*[_type == "album" && owner._ref == $ownerId]{ slug, customSlug }`,
    { ownerId }
  );
  await invalidateCache([
    ...slugs.flatMap((a) =>
      [a.slug?.current, a.customSlug].filter((s): s is string => typeof s === "string" && s.length > 0)
    ).map((s) => CACHE_KEYS.albumBySlug(s)),
  ]);
}
