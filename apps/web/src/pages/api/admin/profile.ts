import type { APIRoute } from "astro";
import { getAdminByEmail } from "@ylx/sanity/lib/admin";
import { sanityWriteClient } from "@ylx/sanity/client";
import { requireAdmin } from "../../../lib/auth";
import { validateBrand } from "../../../lib/brand";
import { invalidateVendorGalleries } from "../../../lib/vendorGalleries";
import { captureError } from "../../../lib/errorTracking";

const VENDOR_NAME_MAX_LENGTH = 80;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Self-service vendor profile (S2): the signed-in admin reads and updates
// ONLY their own doc. Vendors pick their own display name here after first
// Google login — it is never taken from the Google account. Superadmins may
// use it for their own doc too; managing other vendors stays superadmin-only
// in /api/admin/vendors.
export const GET: APIRoute = async ({ cookies }) => {
  const session = await requireAdmin(cookies);
  if (!session) {
    return json({ error: "Unauthorized" }, 401);
  }
  try {
    const doc = await getAdminByEmail(session.email);
    if (!doc || doc.disabled) {
      return json({ error: "Account not found" }, 404);
    }
    return json(
      {
        email: doc.email,
        name: doc.name,
        brand: doc.brand ?? null,
        profileComplete: doc.role !== "vendor" || doc.profileComplete === true,
      },
      200
    );
  } catch (err) {
    console.error("[Profile] Error:", err);
    captureError(err, { route: "admin/profile GET" });
    return json({ error: "Internal server error" }, 500);
  }
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  const session = await requireAdmin(cookies);
  if (!session) {
    return json({ error: "Unauthorized" }, 401);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400);
  }
  if (typeof rawBody !== "object" || rawBody === null || Array.isArray(rawBody)) {
    return json({ error: "Request body must be a valid JSON object" }, 400);
  }

  try {
    const doc = await getAdminByEmail(session.email);
    if (!doc || doc.disabled) {
      return json({ error: "Account not found" }, 404);
    }

    const { name, brand } = rawBody as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return json({ error: "Name is required" }, 400);
      }
      if ([...name.trim()].length > VENDOR_NAME_MAX_LENGTH) {
        return json({ error: "Name must be at most 80 characters" }, 400);
      }
      patch.name = name.trim();
      // A vendor-supplied name completes onboarding (superadmins are complete
      // by role regardless — see GET above).
      patch.profileComplete = true;
    }

    if (brand !== undefined) {
      if (typeof brand !== "object" || brand === null || Array.isArray(brand)) {
        return json({ error: "brand must be an object" }, 400);
      }
      const { logoUrl, accentColor } = brand as Record<string, unknown>;
      if (logoUrl !== undefined && typeof logoUrl !== "string") {
        return json({ error: "logoUrl must be a string" }, 400);
      }
      if (accentColor !== undefined && typeof accentColor !== "string") {
        return json({ error: "accentColor must be a string" }, 400);
      }
      const check = validateBrand({ logoUrl, accentColor });
      if (!check.ok) {
        return json({ error: check.error }, 400);
      }
      const nextBrand: Record<string, string> = {};
      if (logoUrl !== undefined) nextBrand.logoUrl = logoUrl;
      if (accentColor !== undefined) nextBrand.accentColor = accentColor;
      patch.brand = nextBrand;
    }

    if (Object.keys(patch).length === 0) {
      return json({ error: "Nothing to update" }, 400);
    }

    await sanityWriteClient.patch(doc._id).set(patch).commit();
    if (patch.brand !== undefined) {
      await invalidateVendorGalleries(doc._id);
    }
    return json({ success: true }, 200);
  } catch (err) {
    console.error("[Profile] Error:", err);
    captureError(err, { route: "admin/profile PUT" });
    return json({ error: "Internal server error" }, 500);
  }
};
