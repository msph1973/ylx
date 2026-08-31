import { useEffect, useRef } from "react";
import type Ably from "ably";
import { getAblyClient, getChannelName } from "@/lib/ably";
import type {
  RealtimeEventType,
  PhotoUploadedData,
  SelectionChangedData,
  SubmissionReceivedData,
  AlbumUnlockedData,
  AlbumDeliveredData,
  FinalPhotoUploadedData,
  FinalPhotoDeletedData,
} from "@ylx/shared";

export interface RealtimeCallbacks {
  onPhotoUploaded?: (data: PhotoUploadedData) => void;
  onSelectionChanged?: (data: SelectionChangedData) => void;
  onSubmissionReceived?: (data: SubmissionReceivedData) => void;
  onAlbumUnlocked?: (data: AlbumUnlockedData) => void;
  onAlbumReset?: (data: AlbumUnlockedData) => void;
  onAlbumDelivered?: (data: AlbumDeliveredData) => void;
  onFinalPhotoUploaded?: (data: FinalPhotoUploadedData) => void;
  onFinalPhotoDeleted?: (data: FinalPhotoDeletedData) => void;
}

export function useRealtime(
  albumId: string | null,
  callbacks: RealtimeCallbacks
): void {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    if (!albumId) return;

    let cancelled = false;
    let channel: Ably.RealtimeChannel | null = null;
    let ably: Ably.Realtime | null = null;

    const handlers: Partial<
      Record<RealtimeEventType, (message: Ably.Message) => void>
    > = {};

    const setup = async () => {
      ably = await getAblyClient(albumId);
      if (cancelled) return;

      const channelName = getChannelName(albumId);
      channel = ably.channels.get(channelName);

      if (callbacksRef.current.onPhotoUploaded) {
        handlers["photo:uploaded"] = (msg) =>
          callbacksRef.current.onPhotoUploaded?.(msg.data as PhotoUploadedData);
      }
      if (callbacksRef.current.onSelectionChanged) {
        handlers["selection:changed"] = (msg) =>
          callbacksRef.current.onSelectionChanged?.(msg.data as SelectionChangedData);
      }
      if (callbacksRef.current.onSubmissionReceived) {
        handlers["submission:received"] = (msg) =>
          callbacksRef.current.onSubmissionReceived?.(msg.data as SubmissionReceivedData);
      }
      if (callbacksRef.current.onAlbumUnlocked) {
        handlers["album:unlocked"] = (msg) =>
          callbacksRef.current.onAlbumUnlocked?.(msg.data as AlbumUnlockedData);
      }
      if (callbacksRef.current.onAlbumReset) {
        handlers["album:reset"] = (msg) =>
          callbacksRef.current.onAlbumReset?.(msg.data as AlbumUnlockedData);
      }
      if (callbacksRef.current.onAlbumDelivered) {
        handlers["album:delivered"] = (msg) =>
          callbacksRef.current.onAlbumDelivered?.(msg.data as AlbumDeliveredData);
      }
      if (callbacksRef.current.onFinalPhotoUploaded) {
        handlers["finalPhoto:uploaded"] = (msg) =>
          callbacksRef.current.onFinalPhotoUploaded?.(msg.data as FinalPhotoUploadedData);
      }
      if (callbacksRef.current.onFinalPhotoDeleted) {
        handlers["finalPhoto:deleted"] = (msg) =>
          callbacksRef.current.onFinalPhotoDeleted?.(msg.data as FinalPhotoDeletedData);
      }

      // Awaited so a rejected attach (e.g. permission/network failure) flows
      // into this function's own returned promise instead of becoming an
      // unhandled rejection that the outer `.catch()` below never sees.
      // `cancelled` is re-checked after every await: if the component unmounted
      // or switched albums while an earlier await (getAblyClient / a previous
      // subscribe) was still pending, we must not subscribe the remaining
      // handlers — otherwise a stale channel can still deliver events to a
      // component that already cleaned up, and the cleanup return (which runs
      // with a not-yet-populated `handlers`) never sees them to unsubscribe.
      for (const [eventType, handler] of Object.entries(handlers)) {
        if (cancelled) break;
        await channel.subscribe(eventType, handler as (message: Ably.Message) => void);
      }
    };

    void setup().catch((err) => {
      // A rejected getAblyClient() (offline, failed dynamic import('ably'),
      // or an albumId conflict thrown in ably.ts) must not become an
      // unhandled promise rejection — log it and carry on without realtime;
      // the gallery/admin UI still works, it just won't get live updates.
      console.warn(`[Realtime] failed to set up realtime for album "${albumId}"; continuing without it:`, err);
    });

    return () => {
      cancelled = true;
      for (const [eventType, handler] of Object.entries(handlers)) {
        channel?.unsubscribe(eventType, handler as (message: Ably.Message) => void);
      }
      // unsubscribe() alone leaves the channel instance (and its connection/
      // buffer state) alive in the Ably client's internal map forever; release()
      // actually frees it, which matters because an admin can browse many albums
      // (and thus many different channels) in one session.
      if (ably && albumId) {
        try {
          ably.channels.release(getChannelName(albumId));
        } catch (err) {
          console.warn(`[Realtime] failed to release channel "${getChannelName(albumId)}":`, err);
        }
      }
    };
  }, [albumId]);
}
