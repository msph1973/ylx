
# SYSTEM PROMPT / ARCHITECTURE SPECIFICATION & AI AGENT DIRECTIVES (V2 - CONSOLIDATED)

## Project Goal
Build a Full-Stack Photo Proofing Gallery Platform for wedding photographers to distribute photos to clients and allow clients to select photos for final editing.

---

## 1. Core Framework & AI Agent Integration (Mastra.ai Ecosystem)

### A. AI Agent Framework: Mastra.ai
Follow the official guidelines from [Mastra.ai Documentation](https://mastra.ai/):
- Use Mastra as the core telemetry, logging, and agentic orchestration layer for the backend logic.
- Implement Mastra workflows and tools to handle secure server-side interactions, state mutations, and internal automation.

### B. Automated UI Testing & Discovery: Mastra Agent Browser
Follow the official [Mastra Agent Browser Documentation](https://mastra.ai/docs/browser/agent-browser):
- Integrate the Agent Browser capabilities to automate end-to-end (E2E) verification of the gallery.
- Use the browser agent to simulate a client workflow: navigating to the `/gallery/[album-slug]` path, inputting a test PIN, clicking photo selection checkboxes, and clicking the "Submit Selection" button to ensure zero-runtime UI regression.

### C. Frontend Framework: Astro & Next.js Compatibility
Follow the [Astro AI Guides](https://docs.astro.build/en/guides/build-with-ai/) and [Astro Integrations](https://docs.astro.build/en/guides/integrations/):
- Scaffold the frontend using Astro’s island architecture for hyper-fast initial image loads.
- Wrap only the interactive selection grids in lightweight React/Vue components using `client:load` or `client:visible`.
- Define database-driven interactions using Prisma ORM inside secure server endpoints.

---

## 2. Platform Workflow & Core Implementation

### Phase 1: Photographer Upload & Project Creation (Admin Side)
1. **Admin Dash:** Photographer creates a "Client Album" with metadata: Client Name, Event Date, Access PIN, and Max Selection Limit.
2. **Photo Management:** Photos are uploaded as optimized Web-JPEGs and stored as an *array of objects* inside a single Sanity document (following [Sanity AI guidelines](https://www.sanity.io/docs/ai)) or mapped via Prisma to save document limits.

### Phase 2: Client Selection Gallery (Client Side)
1. **Gatekeeping:** Route access requires server-side validation against the defined album PIN.
2. **Interactive Grid:** Responsive grid using smooth lazy loading and window virtualization. Klien marks favorites via checkboxes. Real-time counter caps selection based on the max limit.
3. **Submission Lock:** Clicking "Submit Selection" alters the Album Status to `Locked` across the storage layer, disabling further client-side modifications.

### Phase 3: Photographer Recapitulation & Adobe Lightroom Export
1. **Filename Extraction Feature:** The Admin dashboard displays the original source camera filenames (`DSC_1012.JPG`, etc.) selected by the client.
2. **Copy to Clipboard:** Provide a **"Copy List"** button that outputs filenames as a single comma-separated string (e.g., `DSC_1012, DSC_1054, DSC_1090`). The photographer can paste this string directly into Lightroom’s library filter to isolate RAW source files instantly.

---

## 3. Required Design & Logic Skills

### UI/UX Design System
- **Aesthetic:** Apply ultra-clean, minimalist layouts, premium typography, and seamless transitions based on [Impeccable Style principles](https://impeccable.style/).
- **Optimization:** Use progressive blur-up image loading (LQIP) to maintain a responsive user experience over variable mobile network speeds.
- **Patterns:** Review automation architectures via [obra/superpowers](https://github.com/obra/superpowers) to write modular and self-healing application code.

---

## 4. MCP (Model Context Protocol) & Tooling Integrations

The agent must leverage the following MCP configurations to explore, crawl, verify, and deploy the application:

### A. Content Extraction & Research MCPs
- **Firecrawl MCP:** Use Firecrawl to efficiently scrape, parse, and structure dynamic web elements or external design inspirations into clean Markdown data for the agent to reference.
- **Tavily MCP:** Use the Tavily Search API MCP to execute real-time developer ecosystem queries, fetching up-to-date documentation syntax or resolving version mismatches during the build step.

### B. Database & Version Control MCPs
- **Prisma MCP Server:** Utilize [@prisma/mcp-server](https://www.prisma.io/docs/ai/tools/mcp-server) to introspect local database instances, run safe migrations, and validate schema integrity.
- **GitHub MCP & CLI:** Use the GitHub MCP server alongside the GitHub CLI to automate branching, track implementation issues, and manage automated Pull Requests.

### C. Serverless Deployment & Hosting MCP
- **Vercel MCP:** Integrate the Vercel MCP server to automate preview deployments, manage serverless environment variables securely, and instantly distribute the Astro/Next.js frontend to edge locations.

```