import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../lib/auth";

// Direct-to-Sanity upload credentials.
//
// Vercel Serverless caps a function's request body at ~4.5MB, so full-res wedding
// photos (routinely >4.5MB) can never reach our own `/api/admin/upload` endpoint —
// the platform rejects them with 413 before the handler runs. The fix is to upload
// the binary straight from the browser to Sanity's asset API, bypassing Vercel.
//
// That browser-side upload needs a write token. We never bundle it into client JS;
// instead the authenticated admin fetches it at runtime from this endpoint (guarded
// by `requireAdmin`). Exposure is therefore limited to the single admin's own
// authenticated session — acceptable for this single-admin internal tool.
//
// NOTE (deploy): the app's origin(s) must be added to the Sanity project's CORS
// origins allowlist (manage.sanity.io → API → CORS origins) or the browser upload
// is blocked by CORS. "Allow credentials" is not required (we authenticate with a
// Bearer token, not cookies).

const projectId = process.env.PUBLIC_SANITY_PROJECT_ID;
// Resolve the dataset EXACTLY like packages/sanity/client.ts (the write client used
// by finalize.ts). If these diverged, the browser could upload the binary to one
// dataset while finalize creates the photo doc in another → broken photos.
const dataset = process.env.PUBLIC_SANITY_DATASET || "production";
const token = process.env.SANITY_API_TOKEN;
// Matches the apiVersion used by the server-side clients in packages/sanity/client.ts.
const apiVersion = "2024-01-01";

export const GET: APIRoute = async ({ cookies }) => {
  const session = await requireAdmin(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!projectId || !token) {
    return new Response(
      JSON.stringify({ error: "Upload is not configured on the server" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ projectId, dataset, apiVersion, token }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // Never let a shared cache retain the token response.
        "Cache-Control": "no-store",
      },
    }
  );
};
