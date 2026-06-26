import bcrypt from "bcryptjs";
import { sanityClient, sanityWriteClient } from "../client";

const BCRYPT_ROUNDS = 12;

interface AdminUser {
  _id: string;
  email: string;
  name: string;
  role: string;
  password?: string;
}

interface SanityAdminDoc {
  _id?: string;
  _type: string;
  email: string;
  name: string;
  role: string;
  password?: string;
}

export async function getAdminByEmail(email: string): Promise<AdminUser | null> {
  const query = `*[_type == "admin" && email == $email][0]{
    _id,
    email,
    name,
    role,
    password
  }`;

  const result = await sanityClient.fetch<AdminUser | null>(query, { email });
  return result ?? null;
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
  });

  const { password: _pw, ...adminWithoutPassword } = result;
  return adminWithoutPassword;
}
