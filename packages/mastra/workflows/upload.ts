import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { sanityWriteClient } from "@ylx/sanity/client";

const createAlbumStep = createStep({
  id: "create-album-step",
  description: "Creates a new album document in Sanity",
  inputSchema: z.object({
    title: z.string(),
    clientName: z.string(),
    eventDate: z.string(),
    pin: z.string(),
    maxSelections: z.number(),
    photos: z.array(
      z.object({
        filename: z.string(),
        imageAssetId: z.string(),
      })
    ),
  }),
  outputSchema: z.object({
    albumId: z.string(),
    photos: z.array(
      z.object({
        filename: z.string(),
        imageAssetId: z.string(),
      })
    ),
  }),
  execute: async ({ inputData }) => {
    const doc = await sanityWriteClient.create({
      _type: "album",
      title: inputData.title,
      clientName: inputData.clientName,
      eventDate: inputData.eventDate,
      pin: inputData.pin,
      maxSelections: inputData.maxSelections,
      status: "active",
      photos: [],
    });

    return { albumId: doc._id, photos: inputData.photos };
  },
});

const uploadPhotosStep = createStep({
  id: "upload-photos-step",
  description: "Uploads a batch of photos to the created album",
  inputSchema: z.object({
    albumId: z.string(),
    photos: z.array(
      z.object({
        filename: z.string(),
        imageAssetId: z.string(),
      })
    ),
  }),
  outputSchema: z.object({
    albumId: z.string(),
    photoIds: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    const { albumId, photos } = inputData;
    const photoIds: string[] = [];

    for (const photo of photos) {
      const doc = await sanityWriteClient.create({
        _type: "photo",
        filename: photo.filename,
        image: { _type: "image", asset: { _type: "reference", _ref: photo.imageAssetId } },
        album: { _type: "reference", _ref: albumId },
      });

      await sanityWriteClient
        .patch(albumId)
        .setIfMissing({ photos: [] })
        .append("photos", [{ _type: "reference", _ref: doc._id }])
        .commit();

      photoIds.push(doc._id);
    }

    return { albumId, photoIds };
  },
});

export const uploadWorkflow = createWorkflow({
  id: "upload-workflow",
  description: "Creates an album and uploads photos in batch",
  inputSchema: z.object({
    title: z.string(),
    clientName: z.string(),
    eventDate: z.string(),
    pin: z.string(),
    maxSelections: z.number(),
    photos: z.array(
      z.object({
        filename: z.string(),
        imageAssetId: z.string(),
      })
    ),
  }),
  outputSchema: z.object({
    albumId: z.string(),
    photoIds: z.array(z.string()),
  }),
})
  .then(createAlbumStep)
  .then(uploadPhotosStep)
  .commit();
