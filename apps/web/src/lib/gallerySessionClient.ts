// Client-side helper for the gallery resume-session probe. Isolated from the
// component so the timeout behavior is unit-testable.

export interface ResumedAlbum {
  id: string;
  title: string;
  clientName: string;
  eventDate: string;
  status: string;
  maxSelections: number;
  lastUnlockedAt?: string | null;
  photos: Array<{
    id: string;
    filename: string;
    thumbnailUrl: string;
    thumbnailSrcSet?: string | null;
    url: string;
    lqip?: string | null;
  }>;
}

export const RESUME_TIMEOUT_MS = 5000;

// Returns the album when the signed gallery cookie is still valid, null
// otherwise. Never throws and never hangs: the PIN screen is hidden while
// this runs, so a stalled request must abort after RESUME_TIMEOUT_MS rather
// than leaving the visitor staring at a blank page.
// Accepts an optional external AbortSignal so the caller can cancel the
// probe early (e.g. on unmount or slug change) without waiting for the
// internal timeout.
export async function fetchResumeSession(
  slug: string,
  timeoutMs: number = RESUME_TIMEOUT_MS,
  externalSignal?: AbortSignal
): Promise<ResumedAlbum | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

  try {
    const response = await fetch(`/api/gallery/${slug}/session`, {
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { album?: ResumedAlbum };
    return data.album ?? null;
  } catch {
    // Timeout, network failure, or bad JSON — fall back to the PIN screen.
    return null;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}
