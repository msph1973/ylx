import type { Selection } from "@ylx/shared";

export type ExportFormat = "comma" | "line" | "csv";

export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  comma: "Comma separated",
  line: "One per line",
  csv: "CSV (filename, notes)",
};

export function formatCommaSeparated(selections: Selection[]): string {
  return selections.map((s) => s.photo.filename).join(", ");
}

export function formatPerLine(selections: Selection[]): string {
  return selections.map((s) => s.photo.filename).join("\n");
}

// RFC 4180: quote a field when it contains a comma, double quote, or
// newline; double quotes inside are escaped by doubling them.
function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function formatCsv(selections: Selection[]): string {
  const rows = selections.map(
    (s) => `${csvField(s.photo.filename)},${csvField(s.notes ?? "")}`
  );
  return ["filename,notes", ...rows].join("\n");
}

export function formatSelections(selections: Selection[], format: ExportFormat): string {
  switch (format) {
    case "comma":
      return formatCommaSeparated(selections);
    case "line":
      return formatPerLine(selections);
    case "csv":
      return formatCsv(selections);
  }
}
