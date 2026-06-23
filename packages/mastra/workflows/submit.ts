import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { sanityWriteClient } from "@ylx/sanity/client";

const createSelectionsStep = createStep({
  id: "create-selections-step",
  description: "Creates selection documents for chosen photos",
  inputSchema: z.object({
    albumId: z.string(),
    photoIds: z.array(z.string()),
  }),
  outputSchema: z.object({
    albumId: z.string(),
    selectionIds: z.array(z.string()),
    photoIds: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    const { albumId, photoIds } = inputData;
    const selectionIds: string[] = [];

    for (const photoId of photoIds) {
      const selection = await sanityWriteClient.create({
        _type: "selection",
        album: { _type: "reference", _ref: albumId },
        photo: { _type: "reference", _ref: photoId },
        selectedAt: new Date().toISOString(),
      });
      selectionIds.push(selection._id);
    }

    return { albumId, selectionIds, photoIds };
  },
});

const createSubmissionStep = createStep({
  id: "create-submission-step",
  description: "Creates submission document and locks the album",
  inputSchema: z.object({
    albumId: z.string(),
    selectionIds: z.array(z.string()),
    photoIds: z.array(z.string()),
  }),
  outputSchema: z.object({
    submissionId: z.string(),
    albumId: z.string(),
    selectionCount: z.number(),
  }),
  execute: async ({ inputData }) => {
    const { albumId, selectionIds, photoIds } = inputData;

    const submission = await sanityWriteClient.create({
      _type: "submission",
      album: { _type: "reference", _ref: albumId },
      selections: selectionIds.map((id) => ({
        _type: "reference",
        _ref: id,
      })),
      submittedAt: new Date().toISOString(),
    });

    await sanityWriteClient
      .patch(albumId)
      .set({ status: "locked" })
      .commit();

    return {
      submissionId: submission._id,
      albumId,
      selectionCount: photoIds.length,
    };
  },
});

export const submitWorkflow = createWorkflow({
  id: "submit-workflow",
  description: "Creates selections, submission, and locks the album",
  inputSchema: z.object({
    albumId: z.string(),
    photoIds: z.array(z.string()),
  }),
  outputSchema: z.object({
    submissionId: z.string(),
    albumId: z.string(),
    selectionCount: z.number(),
  }),
})
  .then(createSelectionsStep)
  .then(createSubmissionStep)
  .commit();
