export const STORAGE_TYPES = ["sanity", "drive"] as const;
export const SANITY_STORAGE = STORAGE_TYPES[0];
export const DRIVE_STORAGE = STORAGE_TYPES[1];

export type StorageType = (typeof STORAGE_TYPES)[number];

export function isStorageType(value: unknown): value is StorageType {
  return typeof value === "string" && STORAGE_TYPES.includes(value as StorageType);
}
