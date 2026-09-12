import type { APIRoute } from "astro";
import {
  createInvitedVendor,
  getAdminByEmail,
  listVendors,
} from "@ylx/sanity/lib/admin";
import { isValidInviteEmail } from "@ylx/shared";
import { sanityWriteClient } from "@ylx/sanity/client";
import { CACHE_KEYS, invalidateCache } from "../../../lib/cache";
import { validateBrand } from "../../../lib/brand";
import { requireSuperAdmin } from "../../../lib/auth";
import { captureError } from "../../../lib/errorTracking";

const VENDOR_NAME_MAX_LENGTH = 80;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const GET: APIRoute = async ({ cookies }) => {
  try {
    const session = await requireSuperAdmin(cookies);
    if (!session) {
      return json({ error: "Forbidden" }, 403);
    }
    const vendors = await listVendors();
    return json(
      {
        vendors: vendors.map((vendor) => ({
          id: vendor._id,
          email: vendor.email,
          name: vendor.name,
          role: vendor.role,
          invitedBy: vendor.invitedBy ?? null,
          disabled: vendor.disabled ?? false,
        })),
      },
      200
    );
  } catch (err) {
    console.error("[Vendors] Error:", err);
    captureError(err, { route: "admin/vendors GET" });
    return json({ error: "Internal server error" }, 500);
  }
};

export const POST: APIRoute = async ({ request, cookies }) => {
  // Auth boundary first: unauthenticated callers never reach body parsing.
  const earlySession = await requireSuperAdmin(cookies);
  if (!earlySession) {
    return json({ error: "Forbidden" }, 403);
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
    const session = earlySession;
    const { email, name } = rawBody as Record<string, unknown>;

    if (typeof email !== "string" || !isValidInviteEmail(email.trim().toLowerCase())) {
      return json({ error: "Valid email is required" }, 400);
    }
    if (typeof name !== "string" || name.trim().length === 0) {
      return json({ error: "Name is required" }, 400);
    }
    if ([...name.trim()].length > VENDOR_NAME_MAX_LENGTH) {
      return json({ error: "Name must be at most 80 characters" }, 400);
    }

    const vendor = await createInvitedVendor({ email, name, invitedBy: session.id });
    if (!vendor) {
      return json({ error: "Vendor with this email already exists" }, 409);
    }

    return json(
      {
        success: true,
        vendor: { id: vendor._id, email: vendor.email, name: vendor.name, role: vendor.role },
      },
      201
    );
  } catch (err) {
    // createInvitedVendor re-validates (defense in depth); its validation
    // failures are client errors, everything else is a server error.
    if (
      err instanceof Error &&
      (err.message === "Invalid email format" ||
        err.message === "Name is required" ||
        err.message === "Name must be at most 80 characters" ||
        err.message === "invitedBy is required")
    ) {
      return json({ error: err.message }, 400);
    }
    console.error("[Vendors] Error:", err);
    captureError(err, { route: "admin/vendors POST" });
    return json({ error: "Internal server error" }, 500);
  }
};

// PUT /api/admin/vendors — set a vendor's gallery brand (superadmin-only).
// Body: { email: string, brand: { logoUrl?: string, accentColor?: string } }.
// Provided fields replace the whole brand object (empty object clears it).
export const PUT: APIRoute = async ({ request, cookies }) => {
  // Auth boundary first: unauthenticated callers never reach body parsing.
  const earlySession = await requireSuperAdmin(cookies);
  if (!earlySession) {
    return json({ error: "Forbidden" }, 403);
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
    const session = earlySession;
    const { email, brand } = rawBody as Record<string, unknown>;
    if (typeof email !== "string" || !isValidInviteEmail(email.trim().toLowerCase())) {
      return json({ error: "Valid email is required" }, 400);
    }
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

    const doc = await getAdminByEmail(email.trim().toLowerCase());
    if (!doc || doc.disabled || doc.role !== "vendor") {
      return json({ error: "Vendor not found" }, 404);
    }

    const nextBrand: Record<string, string> = {};
    if (logoUrl !== undefined) nextBrand.logoUrl = logoUrl;
    if (accentColor !== undefined) nextBrand.accentColor = accentColor;
    await sanityWriteClient.patch(doc._id).set({ brand: nextBrand }).commit();

    // Brand renders server-side in galleries (cached per slug): bust every
    // gallery cache entry for this vendor's albums so the new brand shows
    // without waiting for TTL expiry.
    const slugs = await sanityWriteClient.fetch<{ slug?: { current: string }; customSlug?: string }[]>(
      `*[_type == "album" && owner._ref == $ownerId]{ slug, customSlug }`,
      { ownerId: doc._id }
    );
    await invalidateCache([
      ...slugs.flatMap((a) =>
        [a.slug?.current, a.customSlug].filter((s): s is string => typeof s === "string" && s.length > 0)
      ).map((s) => CACHE_KEYS.albumBySlug(s)),
    ]);

    return json({ success: true }, 200);
  } catch (err) {
    console.error("[Vendors] Error:", err);
    captureError(err, { route: "admin/vendors PUT" });
    return json({ error: "Internal server error" }, 500);
  }
};
