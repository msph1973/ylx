// Drive-folder scan for Google-Drive-backed albums (admin only).
//
// The admin pastes a Drive share link in AlbumFormModal; this endpoint
// previews what's inside (folder name + photo count/list) BEFORE any album
// is created. Pure read — nothing here writes to Sanity; creation happens in
// POST /api/admin/albums with the scanned photo list attached.
//
// Error contract:
// - curated `DriveScanError`s carry operator-actionable messages (sharing,
//   rate limit…) and are surfaced verbatim as 502 — safe by construction on
//   this admin-only surface;
// - anything else is an unexpected bug → generic 500 (REVIEW.md §2.3) +
//   captureError for Sentry.

import type { APIRoute } from "astro";
import { requireAdmin } from "../../../../lib/auth";
import { extractFolderId, scanDriveFolder, DriveScanError } from "../../../../lib/gdrive";
import { parseJsonBody } from "../../../../lib/requestBody";
import { captureError } from "../../../../lib/errorTracking";

const JSON_HEADERS = { "Content-Type": "application/json" };

export const POST: APIRoute = async ({ cookies, request }) => {
  const session = await requireAdmin(cookies);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  const body = await parseJsonBody<{ driveUrl?: unknown }>(request);
  if (!body || typeof body.driveUrl !== "string") {
    return new Response(
      JSON.stringify({ error: "Paste a Google Drive folder link first" }),
      { status: 400, headers: JSON_HEADERS }
    );
  }

  const folderId = extractFolderId(body.driveUrl);
  if (!folderId) {
    return new Response(
      JSON.stringify({ error: "That doesn't look like a Google Drive folder link" }),
      { status: 400, headers: JSON_HEADERS }
    );
  }

  try {
    const result = await scanDriveFolder(folderId);
    return new Response(JSON.stringify(result), { status: 200, headers: JSON_HEADERS });
  } catch (error) {
    if (error instanceof DriveScanError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 502,
        headers: JSON_HEADERS,
      });
    }
    console.error("[ScanDrive] failed:", error);
    captureError(error, { route: "admin/albums/scan-drive", folderId });
    return new Response(JSON.stringify({ error: "Failed to scan the Drive folder" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
};
