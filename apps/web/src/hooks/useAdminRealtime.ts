import { useEffect } from "react";
import { getAblyClient } from "@/lib/ably";

export function useAdminRealtime(onUpdate: () => void): void {
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channel: any = null;

    const setup = async () => {
      const ably = await getAblyClient();
      if (cancelled) return;

      channel = ably.channels.get("admin:updates");

      const handler = () => {
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
      channel?.unsubscribe();
    };
  }, [onUpdate]);
}
