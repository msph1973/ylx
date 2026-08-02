import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { schemaTypes } from "./schemas";

// Sanity Studio's Vite bundler only exposes env vars prefixed
// SANITY_STUDIO_ (see https://www.sanity.io/docs/studio/environment-variables)
// — process.env.SANITY_PROJECT_ID here was never set by anything and always
// silently fell back to "", so Studio failed to boot. `dataset` similarly
// used to be hardcoded to "production" regardless of PUBLIC_SANITY_DATASET
// (CI/dev use "test"), silently pointing `sanity dev`/`sanity deploy` at
// production while inspecting test data.
const projectId = process.env.SANITY_STUDIO_PROJECT_ID || "";
const dataset = process.env.SANITY_STUDIO_DATASET || "production";

if (!projectId) {
  throw new Error(
    "[Sanity Studio] SANITY_STUDIO_PROJECT_ID is required but not set. " +
      "Set it in packages/sanity/.env (or your shell) before running `sanity dev`/`sanity deploy`."
  );
}

export default defineConfig({
  name: "ylx-studio",
  title: "YLX Studio",
  projectId,
  dataset,
  plugins: [
    structureTool(),
    visionTool(),
  ],
  schema: {
    types: schemaTypes,
  },
});
