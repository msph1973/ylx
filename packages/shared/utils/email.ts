// Linear-time email shape check for invite flows (S2 multitenant).
// Deliberately regex-free: the naive /^[^s@]+@...$/ pattern is a CodeQL
// ReDoS finding on attacker-controlled input (nested quantifiers backtrack
// on strings like "!@!.!.!..."). Every operation below is O(n) or better.
// Full RFC validation is out of scope; Sanity + Google verify
// deliverability later (invite match, email_verified).
export function isValidInviteEmail(email: string): boolean {
  if (email.length === 0 || email.length > 254) return false;
  for (let i = 0; i < email.length; i++) {
    const c = email.charCodeAt(i);
    if (c <= 32 || c === 127) return false; // no whitespace/control chars
  }
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) return false;
  const domain = email.slice(at + 1);
  return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}
