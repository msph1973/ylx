// Matches either the auto-generated `slug.current` or the admin-chosen
// `customSlug` alias, so both URLs resolve the same gallery.
export const albumBySlugQuery = `*[_type == "album" && (slug.current == $slug || customSlug == $slug)][0] {
  _id,
  title,
  clientName,
  eventDate,
  pin,
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

export const allAlbumsQuery = `*[_type == "album"] | order(_createdAt desc) {
  _id,
  title,
  clientName,
  eventDate,
  pin,
  status,
  customSlug,
  shareCount,
  lastAccessedAt,
  maxSelections,
  "photoCount": count(photos),
  "selectionCount": count(*[_type == "selection" && album._ref == ^._id])
}`;

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
  },
  "selections": *[_type == "selection" && album._ref == ^._id]._id
}`;
