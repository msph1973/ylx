import Ably from "ably";

// Client-side singleton — only created in browser context to avoid SSR leaks.
let clientInstance: Ably.Realtime | null = null;

export function getAblyClient(): Ably.Realtime {
  if (typeof window === "undefined") {
    throw new Error("getAblyClient() must only be called in browser context");
  }

  if (!clientInstance) {
    const key = import.meta.env.PUBLIC_ABLY_KEY;
    if (!key) {
      throw new Error("PUBLIC_ABLY_KEY environment variable is not set");
    }
    clientInstance = new Ably.Realtime({ key });
  }
  return clientInstance;
}

export function getChannelName(albumId: string): string {
  return `album:${albumId}`;
}

export function publishAdminEvent(eventType: string, data?: Record<string, unknown>): void {
  // publishAdminEvent is safe to call server-side — it uses a short-lived REST client
  // instead of the browser singleton to avoid SSR issues.
  try {
    const key = import.meta.env.PUBLIC_ABLY_KEY;
    if (!key) return;
    const rest = new Ably.Rest({ key });
    const channel = rest.channels.get("admin:updates");
    void channel.publish(eventType, data ?? {});
  } catch {
    // Silently fail if Ably is not configured or publish fails
  }
}
