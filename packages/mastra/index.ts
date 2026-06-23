import { Mastra } from "@mastra/core";
import { uploadWorkflow } from "./workflows/upload.js";
import { submitWorkflow } from "./workflows/submit.js";
import { exportWorkflow } from "./workflows/export.js";

export const mastra = new Mastra({
  workflows: {
    uploadWorkflow,
    submitWorkflow,
    exportWorkflow,
  },
});
