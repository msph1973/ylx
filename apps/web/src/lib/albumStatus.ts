export type AlbumStatusVariant = "active" | "submitted" | "locked" | "delivered";

export interface AlbumStatusMeta {
  /** Human-readable badge label. */
  label: string;
  /** Style variant used for badge colors. */
  variant: AlbumStatusVariant;
  /** Short helper describing what the status means for the photographer. */
  hint: string;
}

/**
 * Map a raw album status string to display metadata. `submitted` (the client
 * has finished choosing) is surfaced distinctly from `locked` (the photographer
 * manually closed the gallery); anything unexpected is treated as locked.
 */
export function getAlbumStatusMeta(status: string | undefined | null): AlbumStatusMeta {
  switch (status) {
    case "active":
      return {
        label: "Active",
        variant: "active",
        hint: "Open — the client can still choose photos.",
      };
    case "submitted":
      return {
        label: "Submitted",
        variant: "submitted",
        hint: "The client submitted their selection — ready to export.",
      };
    case "delivered":
      return {
        label: "Delivered",
        variant: "delivered",
        hint: "Final photos have been delivered to the client.",
      };
    case "locked":
    default:
      return {
        label: "Locked",
        variant: "locked",
        hint: "Closed — the client cannot change their selection.",
      };
  }
}

/** All filterable statuses in display order, for filter controls. */
export const ALBUM_STATUS_FILTERS: readonly AlbumStatusVariant[] = [
  "active",
  "submitted",
  "locked",
  "delivered",
] as const;
