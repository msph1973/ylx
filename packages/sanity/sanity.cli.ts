import { defineCliConfig } from 'sanity/cli';

// Same env vars as sanity.config.ts (SANITY_STUDIO_-prefixed, Studio-only —
// see the comment there for why). Keeping both files reading the same vars
// matters here specifically: a mismatch would mean `sanity dev` and
// `sanity deploy` operate against different project/dataset than the Studio
// config itself resolves to at runtime.
const projectId = process.env.SANITY_STUDIO_PROJECT_ID || '';
const dataset = process.env.SANITY_STUDIO_DATASET || 'production';

if (!projectId) {
  throw new Error(
    '[Sanity CLI] SANITY_STUDIO_PROJECT_ID is required but not set. ' +
      'Set it in packages/sanity/.env (or your shell) before running `sanity dev`/`sanity deploy`.'
  );
}

export default defineCliConfig({
  api: {
    projectId,
    dataset,
  },
});
