import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { isValidInviteEmail } from "@ylx/shared";
import { sanityClient, sanityWriteClient } from "../client";

const ADMIN_ROLES = ["superadmin", "vendor"] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

function isAdminRole(value: string): value is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(value);
}

interface AdminUser {
  _id: string;
  email: string;
  name: string;
  role: string;
  password?: string;
  invitedBy?: string;
  disabled?: boolean;
  sessionVersion?: number;
}

interface SanityAdminDoc {
  _id?: string;
  _type: string;
  email: string;
  name: string;
  role: string;
  password?: string;
  invitedBy?: string;
  disabled?: boolean;
  sessionVersion?: number;
}

export async function getAdminByEmail(email: string): Promise<AdminUser | null> {
  // `createAdmin()` below stores every admin's `email` normalized (trimmed +
  // lowercased). Normalizing the lookup value here too (and matching
  // case-insensitively via `lower()`, in case any legacy doc predates
  // normalization) means a login with e.g. "Admin@x.com" still finds the
  // admin created as "admin@x.com" instead of silently failing an
  // exact-match query.
  const normalizedEmail = email.trim().toLowerCase();
  const query = `*[_type == "admin" && lower(email) == $email][0]{
    _id,
    email,
    name,
    role,
    password,
    invitedBy,
    disabled,
    sessionVersion
  }`;

  const result = await sanityClient.fetch<AdminUser | null>(query, { email: normalizedEmail });
  return result ?? null;
}

// Current session version for an admin doc, used by `getSession()` to reject
// cookies signed with an older version (i.e. revoked via logout). Returns
// null if the admin doc no longer exists (deleted admin -> reject).
export async function getAdminSessionVersion(adminId: string): Promise<number | null> {
  const query = `*[_type == "admin" && _id == $adminId][0]{ sessionVersion }`;
  const result = await sanityClient.fetch<{ sessionVersion?: number } | null>(query, { adminId });
  if (result === null) {
    return null; // admin doc was deleted -> caller must reject the session
  }
  return result.sessionVersion ?? 0; // legacy admin doc predating this field
}

// Bumps the session version, immediately invalidating every previously
// issued cookie for this admin (stolen or otherwise) once `getSession()`
// re-checks against Sanity. Called on logout; will also apply to a future
// password-change endpoint.
export async function incrementSessionVersion(adminId: string): Promise<void> {
  await sanityWriteClient
    .patch(adminId)
    .setIfMissing({ sessionVersion: 0 })
    .inc({ sessionVersion: 1 })
    .commit();
}

export async function validateAdminPassword(
  email: string,
  password: string
): Promise<Omit<AdminUser, "password"> | null> {
  const admin = await getAdminByEmail(email);
  if (!admin?.password) {
    return null;
  }

  const isValid = await bcrypt.compare(password, admin.password);
  if (!isValid) {
    return null;
  }

  const { password: _pw, ...adminWithoutPassword } = admin;
  return adminWithoutPassword;
}

// Deterministic per-(normalized-)email Sanity document _id. Hashed rather
// than embedding the raw email: Sanity document IDs may only contain
// `a-zA-Z0-9._-` (no `@`), and Sanity retains every _id ever written even
// after the document is deleted, so raw personal data doesn't belong in one
// (see https://www.sanity.io/docs/content-lake/ids). Using this as the
// document's actual `_id` — instead of a random one — is what lets
// `.create()` below atomically reject a second admin for the same email.
function adminIdForEmail(normalizedEmail: string): string {
  return `admin.${createHash("sha256").update(normalizedEmail).digest("hex")}`;
}

function isConflictError(err: unknown): boolean {
  const statusCode =
    (err as { statusCode?: number })?.statusCode ??
    (err as { response?: { statusCode?: number } })?.response?.statusCode;
  return statusCode === 409;
}

export async function createAdmin(data: {
  email: string;
  password: string;
  name: string;
  role?: string;
}): Promise<Omit<AdminUser, "password"> | null> {
  if (typeof data.password !== "string" || [...data.password].length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  // Validated here (not just at the schema level) so every caller of
  // createAdmin() is protected, not only the ones that happen to go through
  // Studio's own validation UI.
  const role = data.role ?? "vendor";
  if (!isAdminRole(role)) {
    throw new Error(`Invalid role "${role}": must be one of ${ADMIN_ROLES.join(", ")}`);
  }

  // "Admin@x.com" and "admin@x.com" must never become two different admin
  // documents — normalize before it's used anywhere below (the deterministic
  // _id and the stored `email` field both derive from this same value).
  const email = data.email.trim().toLowerCase();

  // The atomic `.create()` conflict check below only catches a SECOND admin
  // for this email that would land on the SAME deterministic _id — it can't
  // see an admin doc from before this ID scheme existed, which would have a
  // random _id instead. This pre-check closes that migration-era gap; it
  // reintroduces a check-then-create race window, but only for that legacy
  // case; two concurrent requests for a genuinely new email still can't both
  // succeed, since they'd still collide on the same deterministic _id below.
  const existingLegacyAdmin = await getAdminByEmail(email);
  if (existingLegacyAdmin) {
    return null;
  }

  // 12 rounds inline — CodeQL js/insufficient-password-hash must see the
  // literal cost to recognise it as sufficient (a named constant is opaque
  // to the query). Keep ≥ 12 per OWASP bcrypt baseline.
  const hashedPassword = await bcrypt.hash(data.password, 12);

  try {
    // `.create()` (unlike `.createIfNotExists()`) atomically fails with a 409
    // if this _id already exists — i.e. an admin with this normalized email
    // already exists — instead of the previous non-atomic check-then-create
    // (getAdminByEmail, then create) that let two concurrent requests both
    // pass the existence check and both write.
    const result = await sanityWriteClient.create<SanityAdminDoc>({
      _id: adminIdForEmail(email),
      _type: "admin",
      email,
      password: hashedPassword,
      name: data.name,
      role,
      sessionVersion: 0,
    });

    const { password: _pw, ...adminWithoutPassword } = result;
    return adminWithoutPassword;
  } catch (err) {
    if (isConflictError(err)) {
      return null;
    }
    throw err;
  }
}

const VENDOR_NAME_MAX_LENGTH = 80;

// Invite-only vendor onboarding (S2 multitenant): creates an `admin` doc
// with `role: "vendor"` and NO password — the vendor authenticates via
// Google login matched on the normalized email. Reuses the deterministic
// `adminIdForEmail` _id scheme, so `.create()` atomically rejects a second
// doc for the same email with a 409 (mapped to null), exactly like
// `createAdmin()` above. Validation lives here (not just at the route
// layer) so every caller is protected.
export async function createInvitedVendor(data: {
  email: string;
  name: string;
  invitedBy: string;
}): Promise<Omit<AdminUser, "password"> | null> {
  const email = data.email.trim().toLowerCase();
  if (!isValidInviteEmail(email)) {
    throw new Error("Invalid email format");
  }

  const name = data.name.trim();
  if (name.length === 0) {
    throw new Error("Name is required");
  }
  if ([...name].length > VENDOR_NAME_MAX_LENGTH) {
    throw new Error("Name must be at most 80 characters");
  }

  if (typeof data.invitedBy !== "string" || data.invitedBy.length === 0) {
    throw new Error("invitedBy is required");
  }

  const existing = await getAdminByEmail(email);
  if (existing) {
    return null;
  }

  try {
    const result = await sanityWriteClient.create<SanityAdminDoc>({
      _id: adminIdForEmail(email),
      _type: "admin",
      email,
      name,
      role: "vendor",
      invitedBy: data.invitedBy,
      sessionVersion: 0,
    });

    const { password: _password, ...vendorWithoutPassword } = result;
    return vendorWithoutPassword;
  } catch (err) {
    if (isConflictError(err)) {
      return null;
    }
    throw err;
  }
}

// All vendor accounts on this instance (superadmin-only callers — enforced
// at the route layer). Password hashes are omitted from the projection so
// they can never leak into a list response.
export async function listVendors(): Promise<Array<Omit<AdminUser, "password">>> {
  const query = `*[_type == "admin" && role == "vendor"] | order(email asc) {
    _id,
    email,
    name,
    role,
    invitedBy,
    disabled,
    sessionVersion
  }`;
  const result = await sanityClient.fetch<Array<Omit<AdminUser, "password">>>(query);
  return result ?? [];
}
