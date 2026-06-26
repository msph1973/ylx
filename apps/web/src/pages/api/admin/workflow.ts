import type { APIRoute } from "astro";
import { requireAdmin } from "../../../lib/auth";

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = requireAdmin(cookies);
  if (!session) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { workflow, data } = await request.json();

    if (!workflow || !data) {
      return new Response(
        JSON.stringify({ error: "Missing workflow or data" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // For now, return a placeholder response
    // Mastra workflows will be integrated when the Mastra package is properly configured
    return new Response(
      JSON.stringify({
        success: true,
        message: `Workflow ${workflow} received`,
        data,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[Mastra] Error:", err);
    return new Response(
      JSON.stringify({ error: "Workflow execution failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
