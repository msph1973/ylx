import Ably from "ably";

let clientInstance: Ably.Realtime | null = null;

export function getAblyClient(): Ably.Realtime {
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
  try {
    const ably = getAblyClient();
    const channel = ably.channels.get("admin:updates");
    channel.publish(eventType, data || {});
  } catch {
    // Silently fail if Ably is not configured
  }
}
