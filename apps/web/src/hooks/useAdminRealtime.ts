import { useEffect } from "react";
import type Ably from "ably";
import { getAblyClient } from "@/lib/ably";

export function useAdminRealtime(onUpdate: () => void): void {
  useEffect(() => {
    let cancelled = false;
    let channel: Ably.RealtimeChannel | null = null;
    let handler: (() => void) | null = null;

    const setup = async () => {
      const ably = await getAblyClient();
      if (cancelled) return;

      channel = ably.channels.get("admin:updates");

      handler = () => {
        onUpdate();
      };

      // Subscribe to every admin event (created, uploaded, deleted, locked,
      // unlocked, submitted, selection changes) so the dashboard always refetches
      // on any state change without needing to enumerate each event name.
      channel.subscribe(handler);
    };

    void setup();

    return () => {
      cancelled = true;
      if (channel && handler) {
        channel.unsubscribe(handler);
      }
    };
  }, [onUpdate]);
}
