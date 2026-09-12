// Matches either the auto-generated `slug.current` or the admin-chosen
// `customSlug` alias, so both URLs resolve the same gallery. Intentionally
// does NOT project `pin`: this result is cached in Upstash by callers
// (session.ts, draft.ts) with a stale TTL, and the PIN is security-sensitive
// — use albumPinBySlugQuery below instead, and never cache its result.
export const albumBySlugQuery = `*[_type == "album" && (slug.current == $slug || customSlug == $slug)][0] {
  _id,
  _rev,
  title,
  clientName,
  eventDate,
  maxSelections,
  status,
  storageType,
  lastUnlockedAt,
  showOriginalAfterDelivery,
  vendorName,
  "owner": owner->{_id, name, brand},
  photos[]-> {
    _id,
    filename,
    image,
    driveFileId,
    driveResourceKey,
    "lqip": image.asset->metadata.lqip
  },
  // The client's previously saved picks — unlock.ts no longer deletes these,
  // so the gallery can pre-fill them here for revision instead of the client
  // having to reselect everything from scratch. Only photoId + notes are
  // needed client-side (no photo details: the photos projection above
  // already carries those).
  "selections": *[_type == "selection" && album._ref == ^._id]{
    "photoId": photo._ref,
    notes
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
  storageType,
  customSlug,
  shareCount,
  lastAccessedAt,
  maxSelections,
  vendorName,
  "photoCount": count(photos),
  "selectionCount": count(*[_type == "selection" && album._ref == ^._id])
}`;

// Every album's pin, for the admin list view only. Callers must fetch this
// fresh from Sanity every time and must never cache it — same rule as
// albumPinBySlugQuery above, just for every album at once instead of one.
export const allAlbumPinsQuery = `*[_type == "album"]{ _id, pin }`;

// Tenant-scoped variants of the two list queries above, for vendor sessions
// (`owner._ref == $ownerId`, bound to session.ownerId). Superadmins keep
// using the unfiltered queries. Vendors must fetch these FRESH on every
// request — never through the shared `albumsList()` Upstash cache, whose key
// is global and would leak one vendor's list to another.
export const ownedAlbumsQuery = `*[_type == "album" && owner._ref == $ownerId] | order(_createdAt desc) {
  _id,
  title,
  clientName,
  eventDate,
  status,
  storageType,
  customSlug,
  shareCount,
  lastAccessedAt,
  maxSelections,
  vendorName,
  "photoCount": count(photos),
  "selectionCount": count(*[_type == "selection" && album._ref == ^._id])
}`;

export const ownedAlbumPinsQuery = `*[_type == "album" && owner._ref == $ownerId]{ _id, pin }`;

export const selectionsByAlbumQuery = `*[_type == "selection" && album._ref == $albumId] {
  _id,
  "albumId": album._ref,
  "photoId": photo._ref,
  photo-> {
    _id,
    filename,
    image,
    driveFileId,
    driveResourceKey,
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
  storageType,
  vendorName,
  showOriginalAfterDelivery,
  // Tenant guard: admin detail/lock/unlock/reset/reorder endpoints read
  // owner._ref from this projection and 404 vendors whose ownerId differs.
  // Ownerless legacy albums (no owner) are superadmin-only: undefined
  // owner fails the vendor check by construction.
  owner,
  photos[]-> {
    _id,
    filename,
    image,
    driveFileId,
    driveResourceKey,
    "lqip": image.asset->metadata.lqip
  },
  "finalPhotos": finalPhotos[]->{
    _id,
    filename,
    image,
    driveFileId,
    driveResourceKey,
    "lqip": image.asset->metadata.lqip
  }
}`;


// Fetches only the delivered final photos for an album, by slug. Used by the
// client-facing final-gallery download flow (delivered status only). Drive
// fields are projected so a driveFileId photo that ever lands in finalPhotos
// renders correctly instead of producing broken image URLs.
export const albumFinalPhotosQuery = `*[_type == "album" && (slug.current == $slug || customSlug == $slug) && status == "delivered"][0]{
  _id,
  title,
  status,
  storageType,
  "finalPhotos": finalPhotos[]->{
    _id,
    filename,
    image,
    driveFileId,
    driveResourceKey,
    "lqip": image.asset->metadata.lqip
  }
}`;
// Every admin document's email — used by the email-notification path after a
// client submits selections (ROADMAP item #1). Intentionally unfiltered by
// `role`: until multi-admin ownership (ROADMAP #7) lands, every admin is
// notified of every submission (over-notify > miss). Projects only `email`
// so the admin's name/role/password never rides along on this read.
export const adminEmailsQuery = `*[_type == "admin"].email`;
