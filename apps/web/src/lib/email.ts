// Transactional email via Resend (ROADMAP item #1 — notify the photographer
// when a client submits their photo selection). Mirrors the `publish*` pattern
// in `ably.ts`: the call site `await`s it, but it never throws — a missing key
// is a silent no-op (dev/preview without Resend configured) and provider
// failures are logged + reported to Sentry, so an email outage can never turn
// an already-committed submission into a 500. See REVIEW.md §env var for the
// RESEND_API_KEY / EMAIL_FROM setup.
import type { Resend } from "resend";
import { captureError } from "./errorTracking";

type ResendClient = Resend;

// Lazy-import the SDK only when first needed (keeps it out of cold-start for
// routes that never email). The Resend client is constructed once and reused
// across invocations — Vercel can retain module state between warm requests.
let resendPromise: Promise<ResendClient | null> | null = null;

function getResend(): Promise<ResendClient | null> {
  if (resendPromise) return resendPromise;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Dev/preview without Resend configured — intentionally silent so the
    // submit flow works end-to-end without an email provider.
    resendPromise = Promise.resolve(null);
    return resendPromise;
  }
  resendPromise = import("resend").then((m) => new m.Resend(apiKey));
  return resendPromise;
}

export interface SubmissionNotification {
  albumId: string;
  albumTitle: string;
  clientName: string;
  selectionCount: number;
  /** Absolute gallery URL the admin can click straight into the album. */
  galleryUrl: string;
}

/** Notifies every admin email address that a client just submitted selections.
 *  Never throws: fetches admin emails, renders a small HTML summary, and sends
 *  one email per recipient via Resend. Any failure (Sanity read, Resend API)
 *  is logged + reported to Sentry and swallowed — callers can `await` this
 *  right after a successful commit without their own try/catch. Returns the
 *  number of emails actually dispatched (0 = skipped or failed). */
export async function notifyAdminsOfSubmission(notif: SubmissionNotification): Promise<number> {
  // The whole body is wrapped so the "never throws" contract holds even if a
  // dynamic import or an unexpected code path rejects — callers (submit.ts)
  // can `await` this right after a committed submission without their own
  // try/catch and trust a return value, never an exception.
  try {
    // Short-circuit before any work when email isn't configured — keeps dev/
    // preview (no Resend) from issuing a pointless Sanity read on every submit.
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey) return 0;
    if (!from) {
      console.warn("[email] EMAIL_FROM not set — skipping admin notification");
      return 0;
    }

    const { sanityClient } = await import("@ylx/sanity/client");
    const { adminEmailsQuery } = await import("@ylx/sanity/lib/queries");

    let emails: string[];
    try {
      emails = await sanityClient.fetch<string[]>(adminEmailsQuery);
    } catch (err) {
      console.error("[email] failed to fetch admin emails:", err);
      captureError(err, { route: "email/admin-emails", albumId: notif.albumId });
      return 0;
    }

    // Dedupe case-insensitively and drop any falsy entries — guards against
    // two admin docs sharing an address (double-send) or a malformed doc with
    // a missing email field, both of which the schema's required validation
    // should prevent but defensive code costs nothing here.
    const uniqueEmails = [...new Set(emails.filter(Boolean).map((e) => e.toLowerCase()))];
    if (uniqueEmails.length === 0) return 0;

    const resend = await getResend();
    if (!resend) return 0;

    const subject = `New selection: ${notif.albumTitle}`;
    const html = renderSubmissionEmail(notif);

    // Sequential on purpose: N is tiny (single admin today), and parallel
    // sends would risk Resend's per-second rate limit for no real latency
    // gain at this scale. A failure for one recipient is logged + reported
    // without aborting the rest.
    let sent = 0;
    for (let i = 0; i < uniqueEmails.length; i++) {
      const to = uniqueEmails[i];
      try {
        const { error } = await resend.emails.send({ from, to: [to], subject, html });
        if (error) {
          // Log a non-identifying index, not the recipient address, so admin
          // emails never land in Vercel logs or Sentry.
          console.error(`[email] Resend rejected send (recipient #${i + 1})`, error);
          captureError(new Error(`Resend send error: ${error.message}`), {
            route: "email/send",
            albumId: notif.albumId,
            recipientIndex: i,
          });
          continue;
        }
        sent++;
      } catch (err) {
        console.error(`[email] send threw (recipient #${i + 1})`, err);
        captureError(err, { route: "email/send", albumId: notif.albumId, recipientIndex: i });
      }
    }
    return sent;
  } catch (err) {
    // Belt-and-suspenders for the "never throws" contract — catches an
    // unexpected dynamic-import rejection or anything the inner try/catch
    // blocks above didn't anticipate.
    console.error("[email] notifyAdminsOfSubmission unexpected failure:", err);
    captureError(err, { route: "email/notify", albumId: notif.albumId });
    return 0;
  }
}

/** Minimal inline-styled HTML summary — no template dependency, stays under
 *  Resend's payload limits, renders fine in all major mail clients. */
function renderSubmissionEmail(notif: SubmissionNotification): string {
  // Coerce to string so a null/undefined title or clientName (shouldn't happen
  // given the schema's required validation, but defensive against malformed
  // data) doesn't throw inside escapeHtml's `.replace`.
  const albumTitle = String(notif.albumTitle ?? "");
  const clientName = notif.clientName ? String(notif.clientName) : "—";
  const selectionCount = notif.selectionCount;
  const galleryUrl = String(notif.galleryUrl ?? "");
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#0f0f10;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f5f5f4;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#1c1c1f;border-radius:12px;border:1px solid #2a2a2e;">
      <tr><td style="padding:24px 24px 8px;">
        <h1 style="margin:0 0 8px;font-size:18px;color:#d4a574;">New photo selection</h1>
        <p style="margin:0;color:#a1a1aa;font-size:13px;">A client just submitted their picks.</p>
      </td></tr>
      <tr><td style="padding:8px 24px;">
        <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="background:#0f0f10;border-radius:8px;">
          <tr><td style="color:#71717a;font-size:12px;width:100px;">Album</td><td style="color:#f5f5f4;font-size:14px;">${escapeHtml(albumTitle)}</td></tr>
          <tr><td style="color:#71717a;font-size:12px;">Client</td><td style="color:#f5f5f4;font-size:14px;">${escapeHtml(clientName)}</td></tr>
          <tr><td style="color:#71717a;font-size:12px;">Selected</td><td style="color:#f5f5f4;font-size:14px;">${selectionCount} photo${selectionCount === 1 ? "" : "s"}</td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:16px 24px 24px;">
        <a href="${escapeHtml(galleryUrl)}" style="display:inline-block;background:#d4a574;color:#0f0f10;text-decoration:none;font-weight:600;font-size:14px;padding:10px 20px;border-radius:8px;">View album</a>
      </td></tr>
    </table>
    <p style="text-align:center;color:#52525b;font-size:11px;margin-top:16px;">YLx · Photo proofing</p>
  </body>
</html>`;
}

// Escapes the HTML-special characters that matter in both text content and
// attribute values (& < > " '), so the same helper is safe for the href too —
// no separate (and easy-to-get-wrong) attribute escaper.
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );
}
