import { useEffect, useRef } from "react";
import type Ably from "ably";
import { getAblyClient, getChannelName } from "@/lib/ably";
import type {
  RealtimeEventType,
  PhotoUploadedData,
  SelectionChangedData,
  SubmissionReceivedData,
  AlbumUnlockedData,
} from "@ylx/shared";

export interface RealtimeCallbacks {
  onPhotoUploaded?: (data: PhotoUploadedData) => void;
  onSelectionChanged?: (data: SelectionChangedData) => void;
  onSubmissionReceived?: (data: SubmissionReceivedData) => void;
  onAlbumUnlocked?: (data: AlbumUnlockedData) => void;
}

export function useRealtime(
  albumId: string | null,
  callbacks: RealtimeCallbacks
): void {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    if (!albumId) return;

    const ably = getAblyClient();
    const channelName = getChannelName(albumId);
    const channel = ably.channels.get(channelName);

    const handlers: Partial<
      Record<RealtimeEventType, (message: Ably.Message) => void>
    > = {};

    if (callbacks.onPhotoUploaded) {
      handlers["photo:uploaded"] = (msg) =>
        callbacksRef.current.onPhotoUploaded?.(msg.data as PhotoUploadedData);
    }
    if (callbacks.onSelectionChanged) {
      handlers["selection:changed"] = (msg) =>
        callbacksRef.current.onSelectionChanged?.(msg.data as SelectionChangedData);
    }
    if (callbacks.onSubmissionReceived) {
      handlers["submission:received"] = (msg) =>
        callbacksRef.current.onSubmissionReceived?.(msg.data as SubmissionReceivedData);
    }
    if (callbacks.onAlbumUnlocked) {
      handlers["album:unlocked"] = (msg) =>
        callbacksRef.current.onAlbumUnlocked?.(msg.data as AlbumUnlockedData);
    }

    for (const [eventType, handler] of Object.entries(handlers)) {
      channel.subscribe(eventType, handler as (message: Ably.Message) => void);
    }

    return () => {
      for (const eventType of Object.keys(handlers)) {
        channel.unsubscribe(eventType);
      }
    };
  }, [albumId]);
}
