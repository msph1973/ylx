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

// Spreadsheet formula injection guard: client-supplied values starting with
// =, +, -, @, tab, CR, or LF would otherwise be executed as formulas by Excel /
// Google Sheets on import (RFC 4180 quoting does NOT prevent this). OWASP
// mitigation: prefix with a single quote so the value is treated as text.
function neutralizeFormula(value: string): string {
  if (/^[=+\-@\t\r\n]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

// RFC 4180: quote a field when it contains a comma, double quote, or
// newline; double quotes inside are escaped by doubling them.
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
