// Matches a bare YYYY-MM-DD date-only string (no time/offset component).
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function formatDate(date: Date | string): string {
  let d: Date;
  if (typeof date === "string" && DATE_ONLY_PATTERN.test(date)) {
    // Date-only strings must be constructed in local time — the native
    // `Date` constructor parses "YYYY-MM-DD" as UTC midnight, which then
    // renders as the PREVIOUS day once `toLocaleDateString` formats it in
    // any timezone west of UTC.
    const [year, month, day] = date.split("-").map(Number);
    d = new Date(year, month - 1, day);
  } else {
    d = new Date(date);
  }
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
