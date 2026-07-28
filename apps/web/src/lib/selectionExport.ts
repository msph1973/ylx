import type { Selection } from "@ylx/shared";

export const EXPORT_FORMATS = ["comma", "line", "csv"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  comma: "Comma separated",
  line: "One per line",
  csv: "CSV (filename, notes)",
};

function joinFilenames(selections: Selection[], sep: string): string {
  return selections.map((s) => s.photo.filename).join(sep);
}

function neutralizeFormula(value: string): string {
  if (/^[=+\-@\t\r\n]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

function csvField(rawValue: string): string {
  const value = neutralizeFormula(rawValue);
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

const FORMATTERS: Record<ExportFormat, (s: Selection[]) => string> = {
  comma: (s) => joinFilenames(s, ", "),
  line: (s) => joinFilenames(s, "\n"),
  csv: formatCsv,
};

export function formatSelections(selections: Selection[], format: ExportFormat): string {
  return FORMATTERS[format](selections);
}
