import Ably from "ably";

// Client-side singleton — only created in browser context to avoid SSR leaks.
let clientInstance: Ably.Realtime | null = null;

export function getAblyClient(): Ably.Realtime {
  if (typeof window === "undefined") {
    throw new Error("getAblyClient() must only be called in browser context");
  }

  if (!clientInstance) {
    // Authenticate via a server endpoint that mints subscribe-only tokens —
    // the full API key is never exposed to the browser.
    clientInstance = new Ably.Realtime({ authUrl: "/api/ably/token" });
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
