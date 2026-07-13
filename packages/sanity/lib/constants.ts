// Shared limits/patterns used by both Sanity schema validation (Studio) and
// the Astro API routes/React forms that enforce the same rules at the edge
// (untrusted request bodies) — kept in one place so the three layers can't
// silently drift out of sync with each other.

/** Max length for the client's `selection.notes` and the photographer's
 *  `selection.photographerReply` — both are short free-text fields sharing
 *  the same limit intentionally, not two independent constraints. */
export const MAX_TEXT_LENGTH = 500;

/** Lowercase letters, numbers, and single hyphens between segments — no
 *  leading/trailing/doubled hyphens. Used for `album.customSlug`. */
export const CUSTOM_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
