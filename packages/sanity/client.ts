import { createClient } from "@sanity/client";
import imageUrlBuilder from "@sanity/image-url";
import type { SanityImageSource } from "@sanity/image-url/lib/types/types";

const projectId = process.env.SANITY_PROJECT_ID || "741sif2l";
const dataset = process.env.SANITY_DATASET || "production";
const token = process.env.SANITY_API_TOKEN;

// Surface a missing token loudly: without it, a private dataset silently 401s on
// every read and the gallery breaks with no obvious cause.
if (!token && process.env.NODE_ENV === "production") {
  console.warn(
    "[Sanity] SANITY_API_TOKEN is not set — reads will fail if the dataset is private."
  );
}

// Server-side read client. Uses a token so reads keep working when the dataset
// is private — this prevents anonymous clients from querying PINs/album data
// directly via the Sanity API and bypassing the /verify PIN + rate limiting.
export const sanityClient = createClient({
  projectId,
  dataset,
  apiVersion: "2024-01-01",
  token,
  useCdn: false,
});

export const sanityWriteClient = createClient({
  projectId,
  dataset,
  apiVersion: "2024-01-01",
  token,
  useCdn: false,
});

const builder = imageUrlBuilder(sanityClient);

export function urlFor(source: SanityImageSource) {
  return builder.image(source);
}
