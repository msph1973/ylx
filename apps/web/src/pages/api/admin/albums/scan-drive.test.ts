import { describe, it, expect, vi, beforeEach } from "vitest";
import { DriveScanError } from "../../../../lib/gdrive";

const requireAdminMock = vi.fn();
const scanDriveFolderMock = vi.fn();
const captureErrorMock = vi.fn();

vi.mock("../../../../lib/auth", () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
}));
vi.mock("../../../../lib/gdrive", () => ({
  // Same class identity as what the handler imports from this mock, so
  // `instanceof DriveScanError` inside the route matches rejections here.
  DriveScanError: class DriveScanError extends Error {},
  extractFolderId: (url: string) => {
    const match = url.match(/drive\.google\.com\/drive\/folders\/([a-zA-Z0-9_-]{10,128})/);
    return match ? match[1] : null;
  },
  scanDriveFolder: (...args: unknown[]) => scanDriveFolderMock(...args),
}));
vi.mock("../../../../lib/errorTracking", () => ({
  captureError: (...args: unknown[]) => captureErrorMock(...args),
}));

import { POST } from "./scan-drive";

function call(body: unknown) {
  return POST({
    cookies: { get: () => ({ value: "session-cookie" }) },
    request: new Request("http://localhost/api/admin/albums/scan-drive", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  } as never);
}

const SCAN_RESULT = {
  status: "ok" as const,
  folderId: "1YSdaCoy8Z7mxivvDH5gw2EAjS",
  folderName: "Doe Wedding",
  photoCount: 2,
  photos: [
    { id: "f1", name: "a.jpg", size: null, width: null, height: null },
    { id: "f2", name: "b.jpg", size: null, width: null, height: null },
  ],
};

beforeEach(() => {
  requireAdminMock.mockReset().mockResolvedValue({ email: "admin@ylex.my.id" });
  scanDriveFolderMock.mockReset().mockResolvedValue(SCAN_RESULT);
  captureErrorMock.mockReset();
});

describe("POST /api/admin/albums/scan-drive", () => {
  it("401s without an admin session", async () => {
    requireAdminMock.mockResolvedValue(null);
    const res = await call({ driveUrl: "https://drive.google.com/drive/folders/1YSdaCoy8Z7mxivvDH5gw2EAjS" });
    expect(res.status).toBe(401);
    expect(scanDriveFolderMock).not.toHaveBeenCalled();
  });

  it("400s on a missing or unparseable drive link", async () => {
    const noUrl = await call({});
    expect(noUrl.status).toBe(400);

    const badUrl = await call({ driveUrl: "https://example.com/folders/1AbCdefghijkl" });
    expect(badUrl.status).toBe(400);

    const malformed = await call("not json");
    expect(malformed.status).toBe(400);
    expect(scanDriveFolderMock).not.toHaveBeenCalled();
  });

  it("returns the scanned folder payload for a valid link", async () => {
    const res = await call({ driveUrl: "https://drive.google.com/drive/folders/1YSdaCoy8Z7mxivvDH5gw2EAjS?usp=sharing" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(SCAN_RESULT);
    expect(scanDriveFolderMock).toHaveBeenCalledWith("1YSdaCoy8Z7mxivvDH5gw2EAjS");
  });

  it("maps an unexpected scan failure to 500 without leaking internals, and captures to Sentry", async () => {
    scanDriveFolderMock.mockRejectedValue(new Error("secret internal stack detail"));
    const res = await call({ driveUrl: "https://drive.google.com/drive/folders/1YSdaCoy8Z7mxivvDH5gw2EAjS" });
    expect(res.status).toBe(500);
    const body = await res.json() as { error?: string };
    // REVIEW.md §2.3 — unexpected errors must not echo internals to the client.
    expect(body.error).not.toContain("secret internal stack detail");
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
  });

  it("propagates curated DriveScanError messages verbatim as 502", async () => {
    // Curated gdrive failures name the operator fix (sharing, rate limit…)
    // — safe by construction on this admin-only surface.
    scanDriveFolderMock.mockRejectedValue(new DriveScanError("Google Drive folder not found or not shared"));
    const res = await call({ driveUrl: "https://drive.google.com/drive/folders/1YSdaCoy8Z7mxivvDH5gw2EAjS" });
    expect(res.status).toBe(502);
    const body = await res.json() as { error?: string };
    expect(body.error).toBe("Google Drive folder not found or not shared");
    expect(captureErrorMock).not.toHaveBeenCalled();
  });
});
