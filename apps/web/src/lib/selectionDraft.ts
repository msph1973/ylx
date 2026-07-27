// Client-side draft persistence for gallery selections, so closing the tab
// or an accidental reload doesn't wipe an in-progress pick. localStorage
// access can throw (private mode, quota, disabled storage) — every function
// fails silent because losing autosave must never break the gallery itself.

export interface SelectionDraft {
  photoIds: string[];
  notes: Record<string, string>;
  savedAt: number;
}

const DRAFT_PREFIX = "ylx:draft:";
// Match the 24h gallery PIN session — a draft older than that belongs to an
// expired session and photo selection context that may have changed.
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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
export function loadDraft(
  albumId: string,
  validPhotoIds: string[],
  maxSelections: number
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

    if (Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS) {
      clearDraft(albumId);
      return null;
    }

    const valid = new Set(validPhotoIds);
    const photoIds = draft.photoIds
      .filter((id): id is string => typeof id === "string" && valid.has(id))
      .slice(0, maxSelections);

    const selected = new Set(photoIds);
    const notes: Record<string, string> = {};
    for (const [id, note] of Object.entries(draft.notes)) {
      if (selected.has(id) && typeof note === "string" && note.length > 0) {
        notes[id] = note;
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
