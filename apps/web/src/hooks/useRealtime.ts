import { useEffect } from "react";
import { getAblyClient, getChannelName } from "@/lib/ably";
import type {
  RealtimeEvent,
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
  useEffect(() => {
    if (!albumId) return;

    const ably = getAblyClient();
    const channelName = getChannelName(albumId);
    const channel = ably.channels.get(channelName);

    const handlers: Partial<
      Record<RealtimeEventType, (event: RealtimeEvent) => void>
    > = {};

    if (callbacks.onPhotoUploaded) {
      handlers["photo:uploaded"] = (event) =>
        callbacks.onPhotoUploaded!(event.data as PhotoUploadedData);
    }
    if (callbacks.onSelectionChanged) {
      handlers["selection:changed"] = (event) =>
        callbacks.onSelectionChanged!(event.data as SelectionChangedData);
    }
    if (callbacks.onSubmissionReceived) {
      handlers["submission:received"] = (event) =>
        callbacks.onSubmissionReceived!(event.data as SubmissionReceivedData);
    }
    if (callbacks.onAlbumUnlocked) {
      handlers["album:unlocked"] = (event) =>
        callbacks.onAlbumUnlocked!(event.data as AlbumUnlockedData);
    }

    for (const [eventType, handler] of Object.entries(handlers)) {
      channel.subscribe(eventType, handler as (message: any) => void);
    }

    return () => {
      for (const eventType of Object.keys(handlers)) {
        channel.unsubscribe(eventType);
      }
    };
  }, [albumId, callbacks]);
}
