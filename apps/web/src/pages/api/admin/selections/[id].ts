import type { APIRoute } from "astro";
import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";
import { requireAdmin } from "../../../../lib/auth";
import { publishAdminEvent } from "../../../../lib/ably";

export const PATCH: APIRoute = async ({ params, request, cookies }) => {
  const session = await requireAdmin(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const selectionId = params.id;
  if (!selectionId) {
    return new Response(JSON.stringify({ error: "Selection ID is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.json();
  const { photographerReply } = body as { photographerReply?: string };

  if (typeof photographerReply !== "string") {
    return new Response(
      JSON.stringify({ error: "photographerReply must be a string" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const selection = await sanityClient.fetch<{ _id: string; albumId: string } | null>(
      `*[_type == "selection" && _id == $id][0]{ _id, "albumId": album._ref }`,
      { id: selectionId }
    );

    if (!selection) {
      return new Response(
        JSON.stringify({ error: "Selection not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    await sanityWriteClient
      .patch(selectionId)
      .set({ photographerReply })
      .commit();

    try {
      publishAdminEvent("selection:replied", {
        albumId: selection.albumId,
        selectionId,
      });
    } catch (err) {
      console.error("[Selection PATCH] publishAdminEvent failed:", err);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Failed to update selection" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
