import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { sanityWriteClient } from "@ylx/sanity/client";

const getSelectionsStep = createStep({
  id: "get-selections-step",
  description: "Fetches all selections for an album with their filenames",
  inputSchema: z.object({
    albumId: z.string(),
  }),
  outputSchema: z.object({
    albumId: z.string(),
    filenames: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    const query = `*[_type == "selection" && album._ref == $albumId]{
      photo->filename
    }`;

    const results = await sanityWriteClient.fetch(query, { albumId: inputData.albumId });
    const filenames = results
      .map((r: any) => r["photo->filename"])
      .filter(Boolean) as string[];

    return { albumId: inputData.albumId, filenames };
  },
});

const formatFilenamesStep = createStep({
  id: "format-filenames-step",
  description: "Formats filenames as comma-separated list for Lightroom import filter",
  inputSchema: z.object({
    albumId: z.string(),
    filenames: z.array(z.string()),
  }),
  outputSchema: z.object({
    albumId: z.string(),
    formattedList: z.string(),
    filenameCount: z.number(),
  }),
  execute: async ({ inputData }) => {
    const { albumId, filenames } = inputData;

    return {
      albumId,
      formattedList: filenames.join(","),
      filenameCount: filenames.length,
    };
  },
});

export const exportWorkflow = createWorkflow({
  id: "export-workflow",
  description: "Fetches selections and formats filenames for Lightroom export",
  inputSchema: z.object({
    albumId: z.string(),
  }),
  outputSchema: z.object({
    albumId: z.string(),
    formattedList: z.string(),
    filenameCount: z.number(),
  }),
})
  .then(getSelectionsStep)
  .then(formatFilenamesStep)
  .commit();
