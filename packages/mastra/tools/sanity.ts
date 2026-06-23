import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { sanityWriteClient } from "@ylx/sanity/client";

export const createAlbumTool = createTool({
  id: "create-album",
  description: "Creates a new album in Sanity CMS",
  inputSchema: z.object({
    title: z.string(),
    clientName: z.string(),
    eventDate: z.string(),
    pin: z.string().regex(/^\d{4}$/),
    maxSelections: z.number().min(1),
  }),
  outputSchema: z.object({
    albumId: z.string(),
  }),
  execute: async (inputData) => {
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

    return { albumId: doc._id };
  },
});

export const uploadPhotoTool = createTool({
  id: "upload-photo",
  description: "Uploads a photo to an album in Sanity CMS",
  inputSchema: z.object({
    albumId: z.string(),
    filename: z.string(),
    imageAssetId: z.string(),
  }),
  outputSchema: z.object({
    photoId: z.string(),
  }),
  execute: async (inputData) => {
    const photo = await sanityWriteClient.create({
      _type: "photo",
      filename: inputData.filename,
      image: { _type: "image", asset: { _type: "reference", _ref: inputData.imageAssetId } },
      album: { _type: "reference", _ref: inputData.albumId },
    });

    await sanityWriteClient
      .patch(inputData.albumId)
      .setIfMissing({ photos: [] })
      .append("photos", [{ _type: "reference", _ref: photo._id }])
      .commit();

    return { photoId: photo._id };
  },
});

export const getSelectionsTool = createTool({
  id: "get-selections",
  description: "Fetches all photo selections for a given album",
  inputSchema: z.object({
    albumId: z.string(),
  }),
  outputSchema: z.object({
    selections: z.array(
      z.object({
        selectionId: z.string(),
        photoId: z.string(),
        filename: z.string(),
        selectedAt: z.string(),
      })
    ),
  }),
  execute: async (inputData) => {
    const query = `*[_type == "selection" && album._ref == $albumId]{
      _id,
      photo._ref,
      photo->filename,
      selectedAt
    }`;

    const results = await sanityWriteClient.fetch(query, { albumId: inputData.albumId });

    return {
      selections: results.map((r: any) => ({
        selectionId: r._id,
        photoId: r["photo._ref"],
        filename: r["photo->filename"] || "",
        selectedAt: r.selectedAt || "",
      })),
    };
  },
});
