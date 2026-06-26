import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import vercel from "@astrojs/vercel/serverless";

export default defineConfig({
  integrations: [react()],
  output: "server",
  adapter: vercel(),
  vite: {
    server: {
      allowedHosts: ["ll.ylex.my.id"],
    },
    resolve: {
      alias: {
        "@": "/src",
      },
    },
  },
});
