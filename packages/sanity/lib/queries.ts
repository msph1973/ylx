// Matches either the auto-generated `slug.current` or the admin-chosen
// `customSlug` alias, so both URLs resolve the same gallery. Intentionally
// does NOT project `pin`: this result is cached in Upstash by callers
// (session.ts, draft.ts) with a stale TTL, and the PIN is security-sensitive
// — use albumPinBySlugQuery below instead, and never cache its result.
export const albumBySlugQuery = `*[_type == "album" && (slug.current == $slug || customSlug == $slug)][0] {
  _id,
  title,
  clientName,
  eventDate,
  maxSelections,
  status,
  lastUnlockedAt,
  photos[]-> {
    _id,
    filename,
    image,
    "lqip": image.asset->metadata.lqip
  }
}`;

// Minimal lookup for the PIN-verification flow only (verify.ts, session.ts).
// Callers must fetch this fresh from Sanity every time and must never cache
// it — it's the one place an album's PIN is allowed to leave Sanity.
export const albumPinBySlugQuery = `*[_type == "album" && (slug.current == $slug || customSlug == $slug)][0] {
  _id,
  pin
}`;

// Intentionally does NOT project `pin` — this result is cached in Upstash
// by its only caller (admin/albums.ts) with a stale TTL, and the PIN is
// security-sensitive (same reasoning as albumBySlugQuery above). Use
// allAlbumPinsQuery below for pins instead, and never cache its result.
export const allAlbumsQuery = `*[_type == "album"] | order(_createdAt desc) {
  _id,
  title,
  clientName,
  eventDate,
  status,
  customSlug,
  shareCount,
  lastAccessedAt,
  maxSelections,
  "photoCount": count(photos),
  "selectionCount": count(*[_type == "selection" && album._ref == ^._id])
}`;

// Every album's pin, for the admin list view only. Callers must fetch this
// fresh from Sanity every time and must never cache it — same rule as
// albumPinBySlugQuery above, just for every album at once instead of one.
export const allAlbumPinsQuery = `*[_type == "album"]{ _id, pin }`;

export const selectionsByAlbumQuery = `*[_type == "selection" && album._ref == $albumId] {
  _id,
  "albumId": album._ref,
  "photoId": photo._ref,
  photo-> {
    _id,
    filename,
    image,
    "lqip": image.asset->metadata.lqip
  },
  selectedAt,
  notes,
  photographerReply
}`;

export const albumWithSelectionsQuery = `*[_type == "album" && _id == $albumId][0] {
  _id,
  title,
  clientName,
  eventDate,
  pin,
  slug,
  customSlug,
  shareCount,
  lastAccessedAt,
  maxSelections,
  status,
  photos[]-> {
    _id,
    filename,
    image,
    "lqip": image.asset->metadata.lqip
  }
}`;
