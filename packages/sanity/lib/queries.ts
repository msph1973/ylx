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
    image
  }
}`;

export const allAlbumsQuery = `*[_type == "album"] | order(createdAt desc) {
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
  photo-> {
    _id,
    filename,
    image
  },
  selectedAt
}`;

export const albumWithSelectionsQuery = `*[_type == "album" && _id == $albumId][0] {
  _id,
  title,
  clientName,
  eventDate,
  maxSelections,
  status,
  photos[]-> {
    _id,
    filename,
    image
  },
  "selections": *[_type == "selection" && album._ref == ^._id]._id
}`;
