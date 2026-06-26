import { useEffect } from "react";
import { getAblyClient } from "@/lib/ably";

export function useAdminRealtime(onUpdate: () => void): void {
  useEffect(() => {
    const ably = getAblyClient();
    const channel = ably.channels.get("admin:updates");

    const handler = () => {
      onUpdate();
    };

    channel.subscribe("album:created", handler);
    channel.subscribe("photo:uploaded", handler);
    channel.subscribe("selection:changed", handler);
    channel.subscribe("album:unlocked", handler);

    return () => {
      channel.unsubscribe("album:created", handler);
      channel.unsubscribe("photo:uploaded", handler);
      channel.unsubscribe("selection:changed", handler);
      channel.unsubscribe("album:unlocked", handler);
    };
  }, [onUpdate]);
}
