import { sanityWriteClient as client } from "../client";

interface AdminUser {
  _id: string;
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

  try {
    const result = await client.fetch<AdminUser | null>(query, { email });
    return result || null;
  } catch {
    return null;
  }
}

export async function validateAdminPassword(
  email: string,
  password: string
): Promise<Omit<AdminUser, "password"> | null> {
  const admin = await getAdminByEmail(email);
  if (!admin || admin.password !== password) {
    return null;
  }

  const { password: _, ...adminWithoutPassword } = admin;
  return adminWithoutPassword;
}

export async function createAdmin(data: {
  email: string;
  password: string;
  name: string;
  role?: string;
}): Promise<Omit<AdminUser, "password"> | null> {
  try {
    const existing = await getAdminByEmail(data.email);
    if (existing) {
      return null;
    }

    const result = await client.create({
      _type: "admin",
      email: data.email,
      password: data.password,
      name: data.name,
      role: data.role || "photographer",
    });

    const { password: _, ...adminWithoutPassword } = result as any;
    return adminWithoutPassword;
  } catch {
    return null;
  }
}
