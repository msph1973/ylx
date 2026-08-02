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
 * Photos and submissions hold strong references to their album, so the album
 * cannot be removed while they still exist. Deleting all of them before the
 * album keeps referential integrity intact — after commit no remaining
 * document points at a deleted one. Mutations are chunked across multiple
 * sequential transactions (see DELETE_MUTATIONS_PER_TRANSACTION) rather than
 * one giant one, each chunk still committing atomically; every child id is
 * ordered ahead of every album id in the flat list below so that ordering
 * guarantee holds across chunk boundaries too — by the time a chunk
 * containing an album delete runs, every earlier chunk (and therefore every
 * one of that album's children) has already committed.
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

  await commitDeletesInChunks([...selectionIds, ...submissionIds, ...photoIds, ...slugLockIds, ...ids]);
}
