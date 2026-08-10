import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Resend SDK mock — installed per test via the `resend` module mock below.
const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => sendMock(...args) };
  },
}));

// Sanity client mock — adminEmailsQuery fetch returns whatever the test sets.
const sanityFetchMock = vi.fn();
vi.mock("@ylx/sanity/client", () => ({
  sanityClient: { fetch: (...args: unknown[]) => sanityFetchMock(...args) },
}));

// captureError is a thin Sentry shim — stub it so tests don't touch Sentry.
const captureErrorMock = vi.fn();
vi.mock("./errorTracking", () => ({
  captureError: (...args: unknown[]) => captureErrorMock(...args),
}));

const NOTIF = {
  albumId: "album-1",
  albumTitle: "Doe Wedding",
  clientName: "Jane & John",
  selectionCount: 12,
  galleryUrl: "https://ylx-msph.vercel.app/admin",
};

beforeEach(() => {
  sendMock.mockReset();
  sanityFetchMock.mockReset();
  captureErrorMock.mockReset();
  // Each test gets a fresh module instance so the lazy `resendPromise` cache
  // in email.ts doesn't leak Resend-configured state from one test into the
  // next (the "key unset → no-op" test would otherwise see a cached client
  // built by an earlier "key set" test).
  vi.resetModules();
});

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
});

// Dynamic-import the fresh module per test so resetModules takes effect.
const load = () => import("./email").then((m) => m.notifyAdminsOfSubmission);

describe("notifyAdminsOfSubmission", () => {
  it("is a silent no-op (0 sent) when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    sanityFetchMock.mockResolvedValue(["admin@ylex.my.id"]);
    const notify = await load();
    const sent = await notify(NOTIF);
    expect(sent).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();
    // No Sanity read either — the lib short-circuits before fetching admins
    // when there's no provider configured.
    expect(sanityFetchMock).not.toHaveBeenCalled();
  });

  it("skips sending when there are no admin emails", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "YLx <noreply@ylex.my.id>";
    sanityFetchMock.mockResolvedValue([]);
    const notify = await load();
    const sent = await notify(NOTIF);
    expect(sent).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("skips sending when EMAIL_FROM is unset even with a key + admins", async () => {
    process.env.RESEND_API_KEY = "re_test";
    delete process.env.EMAIL_FROM;
    sanityFetchMock.mockResolvedValue(["admin@ylex.my.id"]);
    const notify = await load();
    const sent = await notify(NOTIF);
    expect(sent).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends one email per admin and returns the count", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "YLx <noreply@ylex.my.id>";
    sanityFetchMock.mockResolvedValue(["a@ylex.my.id", "b@ylex.my.id"]);
    sendMock.mockResolvedValue({ data: { id: "msg_1" }, error: null });
    const notify = await load();
    const sent = await notify(NOTIF);
    expect(sent).toBe(2);
    expect(sendMock).toHaveBeenCalledTimes(2);
    const first = sendMock.mock.calls[0][0] as { from: string; to: string[]; subject: string; html: string };
    expect(first.from).toBe("YLx <noreply@ylex.my.id>");
    expect(first.to).toEqual(["a@ylex.my.id"]);
    expect(first.subject).toBe("New selection: Doe Wedding");
    expect(first.html).toContain("Doe Wedding");
    expect(first.html).toContain("Jane &amp; John");
    expect(first.html).toContain("12 photos");
    expect(first.html).toContain('href="https://ylx-msph.vercel.app/admin"');
  });

  it("counts only successful sends when one Resend recipient errors (no throw)", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "YLx <noreply@ylex.my.id>";
    sanityFetchMock.mockResolvedValue(["a@ylex.my.id", "b@ylex.my.id"]);
    sendMock
      .mockResolvedValueOnce({ data: null, error: { message: "invalid recipient" } })
      .mockResolvedValueOnce({ data: { id: "msg_2" }, error: null });
    const notify = await load();
    const sent = await notify(NOTIF);
    expect(sent).toBe(1); // only the second went through
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
  });

  it("swallows a thrown Resend error without re-throwing", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "YLx <noreply@ylex.my.id>";
    sanityFetchMock.mockResolvedValue(["a@ylex.my.id"]);
    sendMock.mockRejectedValue(new Error("network down"));
    const notify = await load();
    const sent = await notify(NOTIF);
    expect(sent).toBe(0);
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
  });

  it("returns 0 and reports when the Sanity admin-emails fetch fails", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "YLx <noreply@ylex.my.id>";
    sanityFetchMock.mockRejectedValue(new Error("sanity 500"));
    const notify = await load();
    const sent = await notify(NOTIF);
    expect(sent).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
  });

  it("escapes untrusted album/client names in the HTML body", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "YLx <noreply@ylex.my.id>";
    sanityFetchMock.mockResolvedValue(["a@ylex.my.id"]);
    sendMock.mockResolvedValue({ data: { id: "x" }, error: null });
    const notify = await load();
    await notify({ ...NOTIF, albumTitle: "<script>alert(1)</script>", clientName: "Jane <b>" });
    const html = sendMock.mock.calls[0][0].html as string;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Jane &lt;b&gt;");
  });
});
