import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";

export default defineConfig({
  name: "ylx-studio",
  title: "YLX Studio",
  projectId: process.env.SANITY_PROJECT_ID || "",
  dataset: "production",
  plugins: [structureTool()],
  schema: {
    types: [],
  },
});
