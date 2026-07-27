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

// Spreadsheet formula injection guard: client-supplied values starting with
// =, +, -, @, tab, or CR would otherwise be executed as formulas by Excel /
// Google Sheets on import (RFC 4180 quoting does NOT prevent this). OWASP
// mitigation: prefix with a single quote so the value is treated as text.
function neutralizeFormula(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) {
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
