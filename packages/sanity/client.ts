import { createClient } from "@sanity/client";
import imageUrlBuilder from "@sanity/image-url";
import type { SanityImageSource } from "@sanity/image-url/lib/types/types";

const projectId = process.env.PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.PUBLIC_SANITY_DATASET || "production";
const token = process.env.SANITY_API_TOKEN;
// Optional, separate read-only token so `sanityClient`'s read access can
// actually be scoped down independently of `sanityWriteClient` — until now
// both used SANITY_API_TOKEN, making the read/write client split name-only.
// Falls back to SANITY_API_TOKEN when unset so existing deployments (which
// don't have this new token yet) keep working unchanged.
const readToken = process.env.SANITY_API_READ_TOKEN || token;

if (!projectId) {
  throw new Error("[Sanity] PUBLIC_SANITY_PROJECT_ID is required but not set.");
}

// Surface a missing token loudly: without it, a private dataset silently 401s on
// every read and the gallery breaks with no obvious cause.
if (!readToken && process.env.NODE_ENV === "production") {
  console.warn(
    "[Sanity] SANITY_API_READ_TOKEN/SANITY_API_TOKEN is not set — reads will fail if the dataset is private."
  );
} else if (!process.env.SANITY_API_READ_TOKEN && process.env.NODE_ENV === "production") {
  // The fallback above keeps things working, but it means `sanityClient`
  // still silently carries full write-token privilege on every read-only
  // route — the read/write split this file exists to provide isn't actually
  // in effect until an operator creates a dedicated read-only token in the
  // Sanity dashboard and sets SANITY_API_READ_TOKEN. Surface that loudly
  // rather than let it look "already fixed" just because reads still work.
  console.warn(
    "[Sanity] SANITY_API_READ_TOKEN is not set — sanityClient is falling back to the full-privilege SANITY_API_TOKEN, so read/write separation isn't actually in effect yet. Create a read-only API token in the Sanity dashboard and set SANITY_API_READ_TOKEN to close this gap."
  );
}

// Server-side read client. Uses a token so reads keep working when the dataset
// is private — this prevents anonymous clients from querying PINs/album data
// directly via the Sanity API and bypassing the /verify PIN + rate limiting.
// `perspective: "published"` keeps documents with unpublished Studio edits
// out of read results. Without it (and since apiVersion here predates the
// 2025-02-19 default-perspective change), the implicit "raw" perspective
// returns a draft AND its published counterpart as two separate array
// entries — e.g. an album being edited in Studio would appear duplicated
// in allAlbumsQuery/albumBySlugQuery results.
export const sanityClient = createClient({
  projectId,
  dataset,
  apiVersion: "2024-01-01",
  token: readToken,
  useCdn: false,
  perspective: "published",
});

export const sanityWriteClient = createClient({
  projectId,
  dataset,
  apiVersion: "2024-01-01",
  token,
  useCdn: false,
  perspective: "published",
});

const builder = imageUrlBuilder(sanityClient);

export function urlFor(source: SanityImageSource) {
  return builder.image(source);
}
