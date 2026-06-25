# AGENTS.md

## Project

Full-Stack Photo Proofing Gallery Platform for wedding photographers. Clients select photos from albums via PIN-locked galleries; photographer exports selected filenames for Lightroom.

## Architecture

- **AI Framework:** Mastra.ai — orchestration, telemetry, workflows
- **Frontend:** Astro (island architecture) + React/Vue interactive components via `client:load` or `client:visible`
- **CMS:** Sanity (photo storage as object arrays) or Prisma ORM for DB interactions
- **Deployment:** Vercel (serverless, edge)
- **Dev tools:** GitHub MCP, Prisma MCP, Firecrawl, Tavily

## Key Concepts

1. **Album lifecycle:** Created (with PIN, max selections, client name) → Shared → Client selects → Locked on submit
2. **Gallery route:** `/gallery/[album-slug]` — server-side PIN validation
3. **Lightroom export:** Admin dashboard shows original camera filenames, "Copy List" outputs comma-separated string for Lightroom filter

## Before Building

- Check `mastra.ai/docs` for current Mastra API (workflows, tools, agent browser)
- Check Astro docs for `client:load` / `client:visible` island patterns
- Prisma schema should model: Album, Photo, Selection, SubmissionLock
