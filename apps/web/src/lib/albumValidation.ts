// Shared album validation constants + helpers for the admin album API routes.
//
// albums.ts and albums/[id]/index.ts previously declared these locally; moving
// them here guarantees create and update validate with identical limits.

export const MAX_TEXT_FIELD_LENGTH = 200;
export const MAX_SELECTIONS_UPPER_BOUND = 500;

/** Rejects a YYYY-MM-DD string whose components don't round-trip through
 *  `Date` unchanged (e.g. "2026-02-31" silently normalizes to March 3) — a
 *  shape-only regex misses calendar validity. */
export function isValidCalendarDate(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}