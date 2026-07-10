import Ably from "ably";

// Client-side singleton — only created in browser context to avoid SSR leaks.
let clientInstance: Ably.Realtime | null = null;
// The `albumId` (or `null` for admin/global context) the singleton was first
// created with — its Ably capability is fixed for the client's lifetime, so
// a later call with a different albumId would silently keep the wrong scope.
let clientInstanceAlbumId: string | null = null;

// `albumId`, when provided, is sent as an auth param on every token
// request/renewal so the server can scope the token's capability to just
// that album's channel (see M-2 in new-audit.md). Only the first call per
// page load actually creates the client (every page navigation is a fresh
// module instance). A later call with no albumId reuses the existing scope
// as-is; a later call that *adds* an albumId (e.g. a page combining
// `useAdminRealtime()` + `useRealtime(albumId, ...)`) re-authorizes the same
// connection with that albumId instead of silently ignoring it. Two
// different non-null albumIds on one singleton is a genuine conflict and
// throws, since the singleton can only carry one album's capability.
export function getAblyClient(albumId?: string): Ably.Realtime {
  if (typeof window === "undefined") {
    throw new Error("getAblyClient() must only be called in browser context");
  }

  const requestedAlbumId = albumId ?? null;

  if (!clientInstance) {
    clientInstanceAlbumId = requestedAlbumId;
    // Authenticate via a server endpoint that mints subscribe-only tokens —
    // the full API key is never exposed to the browser.
    clientInstance = new Ably.Realtime({
      authUrl: "/api/ably/token",
      authParams: requestedAlbumId ? { albumId: requestedAlbumId } : undefined,
    });
  } else if (requestedAlbumId !== null && requestedAlbumId !== clientInstanceAlbumId) {
    if (clientInstanceAlbumId === null) {
      clientInstanceAlbumId = requestedAlbumId;
      clientInstance.auth
        .authorize({}, { authParams: { albumId: requestedAlbumId } })
        .catch((err) => console.warn("[Ably] re-authorize with albumId failed:", err));
    } else {
      throw new Error(
        `getAblyClient() already initialized with albumId=${JSON.stringify(clientInstanceAlbumId)}; ` +
          `cannot reuse the singleton with a different albumId=${JSON.stringify(requestedAlbumId)}`
      );
    }
  }
  return clientInstance;
}

export function getChannelName(albumId: string): string {
  return `album:${albumId}`;
}

export function publishAdminEvent(eventType: string, data?: Record<string, unknown>): void {
  publish("admin:updates", eventType, data);
}

export function publishAlbumEvent(albumId: string, eventType: string, data?: Record<string, unknown>): void {
  publish(getChannelName(albumId), eventType, data);
}

function publish(channelName: string, eventType: string, data?: Record<string, unknown>): void {
  try {
    const key = process.env.ABLY_API_KEY;
    if (!key) return;
    const rest = new Ably.Rest({ key });
    const channel = rest.channels.get(channelName);
    void channel.publish(eventType, data ?? {});
  } catch {
    // Silently fail if Ably is not configured or publish fails
  }
}
