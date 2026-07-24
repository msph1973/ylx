import bcrypt from "bcryptjs";
import { sanityClient, sanityWriteClient } from "../client";

const BCRYPT_ROUNDS = 12;

interface AdminUser {
  _id: string;
  email: string;
  name: string;
  role: string;
  password?: string;
  sessionVersion?: number;
}

interface SanityAdminDoc {
  _id?: string;
  _type: string;
  email: string;
  name: string;
  role: string;
  password?: string;
  sessionVersion?: number;
}

export async function getAdminByEmail(email: string): Promise<AdminUser | null> {
  const query = `*[_type == "admin" && email == $email][0]{
    _id,
    email,
    name,
    role,
    password,
    sessionVersion
  }`;

  const result = await sanityClient.fetch<AdminUser | null>(query, { email });
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

export async function createAdmin(data: {
  email: string;
  password: string;
  name: string;
  role?: string;
}): Promise<Omit<AdminUser, "password"> | null> {
  if (data.password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const existing = await getAdminByEmail(data.email);
  if (existing) {
    return null;
  }

  const hashedPassword = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

  const result = await sanityWriteClient.create<SanityAdminDoc>({
    _type: "admin",
    email: data.email,
    password: hashedPassword,
    name: data.name,
    role: data.role ?? "photographer",
    sessionVersion: 0,
  });

  const { password: _pw, ...adminWithoutPassword } = result;
  return adminWithoutPassword;
}
