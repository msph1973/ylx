import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";
import { slugLockId } from "./slug";

// Sanity enforces per-transaction limits on mutation count/payload size, so a
// bulk delete spanning albums with hundreds of photos each risks exceeding
// them and failing atomically with zero deletions. Chunking keeps each
// transaction comfortably under those limits; chunks are committed
// sequentially (never concurrently) so a chunk deleting child documents
// always finishes before the chunk deleting the album(s) that reference
// them — see the ordering note in cascadeDeleteAlbums below.
const DELETE_MUTATIONS_PER_TRANSACTION = 300;

async function commitDeletesInChunks(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += DELETE_MUTATIONS_PER_TRANSACTION) {
    const chunk = ids.slice(i, i + DELETE_MUTATIONS_PER_TRANSACTION);
    const tx = sanityWriteClient.transaction();
    for (const id of chunk) tx.delete(id);
    await tx.commit();
  }
}

/**
 * Atomically delete one or more albums together with every document that
 * depends on them: selections, submissions, and photos.
 *
 * The reference graph isn't a simple tree: `submission.selections[]` ->
 * selection, `selection.album`/`photo.album` -> album, AND `album.photos[]`
 * -> photo. That last pair means album and photo hold STRONG references to
 * EACH OTHER — Sanity refuses to delete either one while the other (still
 * referencing it) exists, unless both are removed in the very same
 * transaction. Since a large album's photos can span many chunked
 * transactions (see DELETE_MUTATIONS_PER_TRANSACTION), photo and album
 * deletes can easily land in different chunks, so relying on delete-order
 * alone can never fully avoid that cycle.
 *
 * Instead, break the cycle first: patch every album to unset its `photos`
 * field (one cheap mutation per album, committed before any deletes). That
 * removes the album -> photo edge, so once submissions and selections are
 * also gone, photos have zero remaining referrers and can be deleted safely
 * regardless of chunk boundaries, and the album itself can then be deleted
 * once its photos are gone too. Order after that unset: submissions (nothing
 * references a submission, so it's always safe first) -> selections (were
 * only blocked by submissions) -> photos (were blocked by selections and,
 * until the unset above, by the album) -> slugLocks + albums (blocked by
 * photos/selections/submissions, now all gone).
 *
 * Also releases each album's `slugLock`/`customSlug` reservation docs (see
 * `lib/slug.ts`) so their slug strings become reusable again.
 */
export async function cascadeDeleteAlbums(albumIds: string[]): Promise<void> {
  const ids = [...new Set(albumIds)].filter(Boolean);
  if (ids.length === 0) return;

  const [selectionIds, submissionIds, photoIds, albumSlugs] = await Promise.all([
    sanityClient.fetch<string[]>(
      `*[_type == "selection" && album._ref in $ids]._id`,
      { ids }
    ),
    sanityClient.fetch<string[]>(
      `*[_type == "submission" && album._ref in $ids]._id`,
      { ids }
    ),
    sanityClient.fetch<string[]>(
      `*[_type == "photo" && album._ref in $ids]._id`,
      { ids }
    ),
    sanityClient.fetch<{ slug?: { current: string }; customSlug?: string }[]>(
      `*[_type == "album" && _id in $ids]{slug, customSlug}`,
      { ids }
    ),
  ]);

  const slugLockIds: string[] = [];
  for (const album of albumSlugs) {
    if (album.slug?.current) slugLockIds.push(slugLockId(album.slug.current));
    if (album.customSlug) slugLockIds.push(slugLockId(album.customSlug));
  }

  // Break the album <-> photo reference cycle before any deletes: once no
  // album references a photo, deleting photos (in whichever chunk they fall
  // into) is never blocked by an album that hasn't been deleted yet.
  const unsetPhotosTx = sanityWriteClient.transaction();
  for (const id of ids) {
    unsetPhotosTx.patch(id, (p) => p.unset(["photos"]));
  }
  await unsetPhotosTx.commit();

  await commitDeletesInChunks([...submissionIds, ...selectionIds, ...photoIds, ...slugLockIds, ...ids]);
}
