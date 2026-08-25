import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { extractFolderId, scanDriveFolder } from "./gdrive";

// ── helpers ─────────────────────────────────────────────────────────

let TEST_PRIVATE_KEY_PEM = "";

beforeAll(async () => {
  TEST_PRIVATE_KEY_PEM = await generatePkcs8Pem();
});

/** Generates a real RSA keypair so the JWT-signing path runs for real
 *  (no mock) — importKey(pkcs8) rejects garbage DER, so a fake PEM would
 *  make every test error out instead of fail on behavior. */
async function generatePkcs8Pem(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
  const der = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  const b64 = Buffer.from(der).toString("base64");
  const wrapped = b64.match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const FOLDER_ID = "1YSdaCoy8Z7mxivvDH5gw2EAjS";

/** Builds a fetch mock that answers the OAuth token exchange plus any
 *  Drive API URL from a lookup of path → response body/status. */
function stubDriveFetch(opts: {
  tokenOk?: boolean;
  routes: Record<string, { status?: number; body: unknown }>;
}) {
  const calls: { url: string; auth: string | null }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      calls.push({ url, auth: null });
      return opts.tokenOk === false
        ? jsonResponse({ error: "bad" }, 400)
        : jsonResponse({ access_token: "test-token", expires_in: 3600 });
    }
    calls.push({ url, auth: init?.headers ? String((init.headers as Record<string, string>).Authorization ?? "") : null });
    const path = url.replace(/^https:\/\/www\.googleapis\.com\/drive\/v3\//, "").split("?")[0];
    const route = opts.routes[path];
    if (!route) return jsonResponse({ error: "unmatched route" }, 500);
    return jsonResponse(route.body, route.status ?? 200);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

beforeEach(() => {
  // Module-level token cache would leak a minted token between tests and
  // break the "one OAuth call" assertion — reset via reimport is heavy, so
  // instead every test runs with fresh env and the cache only ever warms
  // within a single test (assertions account for it).
  vi.stubEnv("GDRIVE_CLIENT_EMAIL", "sa@test.iam.gserviceaccount.com");
  vi.stubEnv("GDRIVE_PRIVATE_KEY", TEST_PRIVATE_KEY_PEM);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ── extractFolderId ────────────────────────────────────────────────

describe("extractFolderId", () => {
  it("extracts the id from a standard share link", () => {
    expect(extractFolderId("https://drive.google.com/drive/folders/1AbC_d-1234567890")).toBe("1AbC_d-1234567890");
  });

  it("extracts the id when the link carries ?usp=sharing", () => {
    expect(extractFolderId("https://drive.google.com/drive/folders/1AbC_d-1234567890?usp=sharing")).toBe(
      "1AbC_d-1234567890"
    );
  });

  it("returns null for non-folder URLs and unsupported formats", () => {
    expect(extractFolderId("https://drive.google.com/file/d/1AbC/view")).toBeNull();
    expect(extractFolderId("https://example.com/folders/1AbCdefghij")).toBeNull();
    expect(extractFolderId("not a url")).toBeNull();
    expect(extractFolderId("")).toBeNull();
  });
});

// ── scanDriveFolder ────────────────────────────────────────────────

describe("scanDriveFolder", () => {
  it("rejects structurally invalid folder ids before any network call", async () => {
    await expect(scanDriveFolder("short")).rejects.toThrow(/Invalid Google Drive folder id/i);
  });

  it("throws a clear error when credentials are not configured", async () => {
    vi.stubEnv("GDRIVE_CLIENT_EMAIL", "");
    const calls = stubDriveFetch({ routes: {} });
    await expect(scanDriveFolder(FOLDER_ID)).rejects.toThrow(/not configured/i);
    expect(calls).toHaveLength(0); // fails before any network traffic
  });

  it("returns folder name and normalized photo list", async () => {
    const calls = stubDriveFetch({
      routes: {
        [`files/${FOLDER_ID}`]: { body: { id: FOLDER_ID, name: "Doe Wedding" } },
        files: {
          body: {
            files: [
              { id: "f1", name: "HFI_1323.JPG", mimeType: "image/jpeg", size: "4521984",
                imageMediaMetadata: { width: 6000, height: 4000 } },
              { id: "f2", name: "HFI_1324.JPG", mimeType: "image/jpeg" }, // no size / dims
            ],
          },
        },
      },
    });

    const result = await scanDriveFolder(FOLDER_ID);

    expect(result).toEqual({
      folderId: FOLDER_ID,
      folderName: "Doe Wedding",
      photoCount: 2,
      photos: [
        { id: "f1", name: "HFI_1323.JPG", size: 4521984, width: 6000, height: 4000 },
        { id: "f2", name: "HFI_1324.JPG", size: null, width: null, height: null },
      ],
    });
    // Drive calls carry the minted bearer token; the OAuth call itself does not.
    const driveCalls = calls.filter((c) => c.url.includes("googleapis.com/drive"));
    expect(driveCalls.length).toBeGreaterThanOrEqual(2);
    for (const c of driveCalls) expect(c.auth).toBe("Bearer test-token");
  });

  it("follows nextPageToken until exhausted and merges pages", async () => {
    let filesCall = 0;
    const calls = stubDriveFetch({
      routes: {
        [`files/${FOLDER_ID}`]: { body: { id: FOLDER_ID, name: "Big Album" } },
      },
    });
    const fetchMock = vi.mocked(globalThis.fetch);
    // The files route needs stateful paging, layered over the route table above.
    fetchMock.mockImplementation(async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        calls.push({ url, auth: null });
        return jsonResponse({ access_token: "test-token", expires_in: 3600 });
      }
      if (url.endsWith("/drive/v3/files") || url.includes("/drive/v3/files?")) {
        calls.push({ url, auth: "" });
        filesCall += 1;
        if (filesCall === 1) {
          return jsonResponse({ nextPageToken: "PAGE2", files: [{ id: "a1", name: "a.jpg", mimeType: "image/jpeg" }] });
        }
        expect(url).toContain("pageToken=PAGE2");
        return jsonResponse({ files: [{ id: "b1", name: "b.jpg", mimeType: "image/jpeg" }] });
      }
      calls.push({ url, auth: "" });
      return jsonResponse({ id: FOLDER_ID, name: "Big Album" });
    });

    const result = await scanDriveFolder(FOLDER_ID);

    expect(result.photos.map((p) => p.id)).toEqual(["a1", "b1"]);
    expect(result.photoCount).toBe(2);
  });

  it("maps Drive 404 to a folder-not-found message", async () => {
    stubDriveFetch({
      routes: {
        [`files/${FOLDER_ID}`]: { status: 404, body: { error: { message: "File not found" } } },
      },
    });
    await expect(scanDriveFolder(FOLDER_ID)).rejects.toThrow(/not found or not shared/i);
  });

  it("maps Drive 403 to an access-denied message", async () => {
    stubDriveFetch({
      routes: {
        [`files/${FOLDER_ID}`]: { status: 403, body: { error: { message: "insufficientPermissions" } } },
      },
    });
    await expect(scanDriveFolder(FOLDER_ID)).rejects.toThrow(/access denied/i);
  });

  it("maps Drive 429 to a rate-limit message", async () => {
    stubDriveFetch({
      routes: {
        [`files/${FOLDER_ID}`]: { status: 429, body: {} },
      },
    });
    await expect(scanDriveFolder(FOLDER_ID)).rejects.toThrow(/rate limit/i);
  });

  it("caches the access token between consecutive scans (one OAuth call)", async () => {
    // Dynamic import is deliberate here: the module-level token cache must be
    // cold for this assertion to mean anything, and vi.resetModules() only
    // affects subsequent dynamic imports — a static top-level import would
    // stay bound to the instance earlier tests already warmed.
    vi.resetModules();
    const { scanDriveFolder: freshScan } = await import("./gdrive");

    const routes = {
      [`files/${FOLDER_ID}`]: { body: { id: FOLDER_ID, name: "X" } },
      files: { body: { files: [] } },
    };
    const calls = stubDriveFetch({ routes });

    await freshScan(FOLDER_ID);
    await freshScan(FOLDER_ID);

    const oauthCalls = calls.filter((c) => c.url.startsWith("https://oauth2.googleapis.com"));
    expect(oauthCalls).toHaveLength(1);
  });
});
