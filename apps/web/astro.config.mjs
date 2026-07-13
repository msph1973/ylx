import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import vercel from "@astrojs/vercel";

export default defineConfig({
  integrations: [react()],
  output: "server",
  adapter: vercel({
    webAnalytics: {
      enabled: true,
    },
  }),
  // Dev-only overlay; it intercepts pointer events over bottom-centered UI
  // (e.g. the lightbox controls) and flakes Playwright. Absent from prod builds.
  devToolbar: { enabled: false },
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
