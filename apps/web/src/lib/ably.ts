import Ably from "ably";

// Client-side singleton — only created in browser context to avoid SSR leaks.
let clientInstance: Ably.Realtime | null = null;

// `albumId`, when provided, is sent as an auth param on every token
// request/renewal so the server can scope the token's capability to just
// that album's channel (see M-2 in new-audit.md — only meaningful the first
// time the singleton is created per page load, since every page navigation
// is a fresh module instance; admin dashboard pages call this with no
// albumId and never need per-album capability).
export function getAblyClient(albumId?: string): Ably.Realtime {
  if (typeof window === "undefined") {
    throw new Error("getAblyClient() must only be called in browser context");
  }

  if (!clientInstance) {
    // Authenticate via a server endpoint that mints subscribe-only tokens —
    // the full API key is never exposed to the browser.
    clientInstance = new Ably.Realtime({
      authUrl: "/api/ably/token",
      authParams: albumId ? { albumId } : undefined,
    });
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
