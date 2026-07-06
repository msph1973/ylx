export const albumBySlugQuery = `*[_type == "album" && slug.current == $slug][0] {
  _id,
  title,
  clientName,
  eventDate,
  pin,
  maxSelections,
  status,
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
  "photoCount": count(photos)
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
  selectedAt
}`;

export const albumWithSelectionsQuery = `*[_type == "album" && _id == $albumId][0] {
  _id,
  title,
  clientName,
  eventDate,
  pin,
  slug,
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
