import { useEffect } from "react";
import type Ably from "ably";
import { getAblyClient } from "@/lib/ably";

const ADMIN_CHANNEL_NAME = "admin:updates";

export function useAdminRealtime(onUpdate: () => void): void {
  useEffect(() => {
    let cancelled = false;
    let channel: Ably.RealtimeChannel | null = null;
    let handler: (() => void) | null = null;
    let ably: Ably.Realtime | null = null;

    const setup = async () => {
      ably = await getAblyClient();
      if (cancelled) return;

      channel = ably.channels.get(ADMIN_CHANNEL_NAME);

      handler = () => {
        onUpdate();
      };

      // Subscribe to every admin event (created, uploaded, deleted, locked,
      // unlocked, submitted, selection changes) so the dashboard always refetches
      // on any state change without needing to enumerate each event name.
      channel.subscribe(handler);
    };

    void setup().catch((err) => {
      // A rejected getAblyClient() (offline, failed dynamic import('ably'),
      // or an albumId conflict thrown in ably.ts) must not become an
      // unhandled promise rejection — log it and carry on without realtime;
      // the admin UI still works, it just won't get live updates.
      console.warn("[AdminRealtime] failed to set up realtime updates; continuing without it:", err);
    });

    return () => {
      cancelled = true;
      if (channel && handler) {
        channel.unsubscribe(handler);
      }
      // unsubscribe() alone leaves the channel instance (and its connection/
      // buffer state) alive in the Ably client's internal map forever; release()
      // actually frees it — mirrors useRealtime's cleanup, which matters here
      // too since the admin dashboard can stay mounted for a long session.
      if (ably) {
        try {
          ably.channels.release(ADMIN_CHANNEL_NAME);
        } catch (err) {
          console.warn(`[AdminRealtime] failed to release channel "${ADMIN_CHANNEL_NAME}":`, err);
        }
      }
    };
  }, [onUpdate]);
}
