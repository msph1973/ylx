import { useEffect } from "react";
import { getAblyClient } from "@/lib/ably";

export function useAdminRealtime(onUpdate: () => void): void {
  useEffect(() => {
    const ably = getAblyClient();
    const channel = ably.channels.get("admin:updates");

    const handler = () => {
      onUpdate();
    };

    // Subscribe to every admin event (created, uploaded, deleted, locked,
    // unlocked, submitted, selection changes) so the dashboard always refetches
    // on any state change without needing to enumerate each event name.
    channel.subscribe(handler);

    return () => {
      channel.unsubscribe(handler);
    };
  }, [onUpdate]);
}
