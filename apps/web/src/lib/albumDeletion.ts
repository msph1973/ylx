import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";

/**
 * Atomically delete one or more albums together with every document that
 * depends on them: selections, submissions, and photos.
 *
 * Photos and submissions hold strong references to their album, so the album
 * cannot be removed while they still exist. Deleting all of them in a single
 * transaction keeps referential integrity intact — after commit no remaining
 * document points at a deleted one.
 */
export async function cascadeDeleteAlbums(albumIds: string[]): Promise<void> {
  const ids = [...new Set(albumIds)].filter(Boolean);
  if (ids.length === 0) return;

  const [selectionIds, submissionIds, photoIds] = await Promise.all([
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
  ]);

  const tx = sanityWriteClient.transaction();
  for (const id of selectionIds) tx.delete(id);
  for (const id of submissionIds) tx.delete(id);
  for (const id of photoIds) tx.delete(id);
  for (const id of ids) tx.delete(id);
  await tx.commit();
}
