import type { APIRoute } from "astro";
import { sanityClient, sanityWriteClient } from "@ylx/sanity/client";
import { requireAdmin } from "../../../../lib/auth";
import { publishAdminEvent } from "../../../../lib/ably";
import { invalidateCache, CACHE_KEYS } from "../../../../lib/cache";

// Kept in sync with the `Rule.max(500)` validation on
// `selection.photographerReply` in packages/sanity/schemas/selection.ts.
const MAX_REPLY_LENGTH = 500;

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function badRequest(error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

/** Validates the PATCH body, returning the reply string or an error Response. */
function parsePhotographerReply(body: unknown): string | Response {
  const { photographerReply } = (body ?? {}) as { photographerReply?: unknown };

  if (typeof photographerReply !== "string") {
    return badRequest("photographerReply must be a string");
  }
  if (photographerReply.length > MAX_REPLY_LENGTH) {
    return badRequest(`photographerReply must be ${MAX_REPLY_LENGTH} characters or fewer`);
  }
  return photographerReply;
}

export const PATCH: APIRoute = async ({ params, request, cookies }) => {
  const session = await requireAdmin(cookies);
  if (!session) {
    return unauthorized();
  }

  const selectionId = params.id;
  if (!selectionId) {
    return badRequest("Selection ID is required");
  }

  const body = await request.json();
  const photographerReply = parsePhotographerReply(body);
  if (photographerReply instanceof Response) {
    return photographerReply;
  }

  try {
    const selection = await sanityClient.fetch<{ _id: string; albumId: string } | null>(
      "*[_type == 'selection' && _id == $id][0]{ _id, 'albumId': album._ref }",
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
    // Admin-only `gallery/[slug]/selections.ts` GET caches this album's
    // selections (15s/60s SWR) — without invalidating, a saved reply can
    // appear stale to whoever is viewing that endpoint.
    await invalidateCache(CACHE_KEYS.albumSelections(selection.albumId));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[Selection PATCH] Failed to update selection:", err);
    return new Response(
      JSON.stringify({ error: "Failed to update selection" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
