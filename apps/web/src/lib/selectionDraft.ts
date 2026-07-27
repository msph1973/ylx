// Client-side draft persistence for gallery selections, so closing the tab
// or an accidental reload doesn't wipe an in-progress pick. localStorage
// access can throw (private mode, quota, disabled storage) — every function
// fails silent because losing autosave must never break the gallery itself.

import { MAX_TEXT_LENGTH } from "@ylx/sanity/lib/constants";

export interface SelectionDraft {
  photoIds: string[];
  notes: Record<string, string>;
  savedAt: number;
}

const DRAFT_PREFIX = "ylx:draft:";
// Match the 24h gallery PIN session — a draft older than that belongs to an
// expired session and photo selection context that may have changed.
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Tolerate small clock skew, but a savedAt further in the future than this
// means a corrupted/tampered entry — restoring it could evade the age check.
const FUTURE_SKEW_MS = 60 * 1000;

function draftKey(albumId: string): string {
  return `${DRAFT_PREFIX}${albumId}`;
}

export function saveDraft(
  albumId: string,
  photoIds: string[],
  notes: Record<string, string>
): void {
  try {
    if (photoIds.length === 0 && Object.keys(notes).length === 0) {
      clearDraft(albumId);
      return;
    }
    const draft: SelectionDraft = { photoIds, notes, savedAt: Date.now() };
    window.localStorage.setItem(draftKey(albumId), JSON.stringify(draft));
  } catch {
    // Storage unavailable/full — autosave is best-effort.
  }
}

// Returns a draft cleaned against the current album state: photo ids that no
// longer exist are dropped, the selection is clamped to maxSelections, and
// notes for unselected/unknown photos are discarded. Returns null when there
// is no usable draft (missing, corrupt, expired, or empty after cleaning).
// `notBefore` (ms epoch) rejects drafts saved before the album's most recent
// unlock — those selections were deleted server-side, and a client that
// missed the realtime unlock event must not silently restore them.
export function loadDraft(
  albumId: string,
  validPhotoIds: string[],
  maxSelections: number,
  notBefore?: number
): SelectionDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(albumId));
    if (!raw) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      clearDraft(albumId);
      return null;
    }

    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray((parsed as SelectionDraft).photoIds) ||
      typeof (parsed as SelectionDraft).notes !== "object" ||
      (parsed as SelectionDraft).notes === null ||
      typeof (parsed as SelectionDraft).savedAt !== "number"
    ) {
      clearDraft(albumId);
      return null;
    }

    const draft = parsed as SelectionDraft;

    if (
      !Number.isFinite(draft.savedAt) ||
      draft.savedAt > Date.now() + FUTURE_SKEW_MS ||
      Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS ||
      (notBefore !== undefined && Number.isFinite(notBefore) && draft.savedAt <= notBefore)
    ) {
      clearDraft(albumId);
      return null;
    }

    const valid = new Set(validPhotoIds);
    const seen = new Set<string>();
    const photoIds: string[] = [];
    for (const id of draft.photoIds) {
      if (typeof id !== "string" || !valid.has(id) || seen.has(id)) continue;
      seen.add(id);
      photoIds.push(id);
      if (photoIds.length >= maxSelections) break;
    }

    const selected = new Set(photoIds);
    const notes: Record<string, string> = {};
    for (const [id, note] of Object.entries(draft.notes)) {
      if (selected.has(id) && typeof note === "string" && note.length > 0) {
        // Submit rejects notes over MAX_TEXT_LENGTH with a 400 for the whole
        // payload — truncating on restore keeps an oversized stored note from
        // bricking the eventual submit.
        notes[id] = note.slice(0, MAX_TEXT_LENGTH);
      }
    }

    if (photoIds.length === 0) {
      return null;
    }

    return { photoIds, notes, savedAt: draft.savedAt };
  } catch {
    return null;
  }
}

export function clearDraft(albumId: string): void {
  try {
    window.localStorage.removeItem(draftKey(albumId));
  } catch {
    // ignore
  }
}
