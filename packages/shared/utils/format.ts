export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatFilenames(filenames: string[]): string {
  return filenames.join(", ");
}

export function truncateFilename(
  filename: string,
  maxLength: number = 30,
): string {
  if (filename.length <= maxLength) return filename;
  const ext = filename.lastIndexOf(".");
  if (ext === -1) return filename.slice(0, maxLength) + "...";
  const base = filename.slice(0, ext);
  const extension = filename.slice(ext);
  const available = maxLength - extension.length - 3;
  return base.slice(0, Math.max(available, 0)) + "..." + extension;
}
