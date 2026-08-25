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
    // Origin-exact (not substring) — CodeQL js/incomplete-url-substring-sanitization.
    const origin = new URL(url).origin;
    if (origin === "https://oauth2.googleapis.com") {
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
  vi.stubEnv("GDRIVE_CLIENT_EMAIL", "sa@test.iam.gserviceaccount.com");
  vi.stubEnv("GDRIVE_PRIVATE_KEY", TEST_PRIVATE_KEY_PEM);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Fresh module instance with a COLD token cache — for tests whose assertions
 *  depend on cache state (env-guard ordering, OAuth-call counting). Static
 *  imports stay bound to whatever instance earlier tests already warmed. */
async function freshModule() {
  vi.resetModules();
  return await import("./gdrive");
}

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

  it("throws a clear error when credentials are not configured — even with a warm token cache", async () => {
    // Cubic round-1: getAccessToken() consults the module-level cache BEFORE
    // env vars, so this test is only honest against a cold module.
    const { scanDriveFolder: freshScan } = await freshModule();
    vi.stubEnv("GDRIVE_CLIENT_EMAIL", "");
    const calls = stubDriveFetch({ routes: {} });
    await expect(freshScan(FOLDER_ID)).rejects.toThrow(/not configured/i);
    expect(calls).toHaveLength(0); // fails before any network traffic
  });

  it("returns folder name and normalized photo list (resourceKey preserved)", async () => {
    const calls = stubDriveFetch({
      routes: {
        [`files/${FOLDER_ID}`]: { body: { id: FOLDER_ID, name: "Doe Wedding" } },
        files: {
          body: {
            files: [
              { id: "f1", name: "HFI_1323.JPG", mimeType: "image/jpeg", size: "4521984",
                imageMediaMetadata: { width: 6000, height: 4000 } },
              { id: "f2", name: "HFI_1324.JPG", mimeType: "image/jpeg", resourceKey: "rk_abc" }, // no size / dims
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
      truncated: false,
      photos: [
        { id: "f1", name: "HFI_1323.JPG", size: 4521984, width: 6000, height: 4000, resourceKey: null },
        { id: "f2", name: "HFI_1324.JPG", size: null, width: null, height: null, resourceKey: "rk_abc" },
      ],
    });
    // Drive calls carry the minted bearer token; the OAuth call itself does not.
    const driveCalls = calls.filter((c) => c.url.includes("googleapis.com/drive"));
    expect(driveCalls.length).toBeGreaterThanOrEqual(2);
    for (const c of driveCalls) expect(c.auth).toBe("Bearer test-token");
  });

  it("follows nextPageToken until exhausted and merges pages", async () => {
    let filesCall = 0;
    stubDriveFetch({
      routes: {
        [`files/${FOLDER_ID}`]: { body: { id: FOLDER_ID, name: "Big Album" } },
      },
    });
    vi.mocked(globalThis.fetch).mockImplementation(async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (new URL(url).origin === "https://oauth2.googleapis.com") {
        return jsonResponse({ access_token: "test-token", expires_in: 3600 });
      }
      if (new URL(url).pathname === "/drive/v3/files") {
        filesCall += 1;
        if (filesCall === 1) {
          return jsonResponse({ nextPageToken: "PAGE2", files: [{ id: "a1", name: "a.jpg", mimeType: "image/jpeg" }] });
        }
        expect(url).toContain("pageToken=PAGE2");
        return jsonResponse({ files: [{ id: "b1", name: "b.jpg", mimeType: "image/jpeg" }] });
      }
      return jsonResponse({ id: FOLDER_ID, name: "Big Album" });
    });

    const result = await scanDriveFolder(FOLDER_ID);

    expect(result.photos.map((p) => p.id)).toEqual(["a1", "b1"]);
    expect(result.photoCount).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it("stops at MAX_DRIVE_PHOTOS and flags truncation", async () => {
    // Cold module: the OAuth-call count below is only meaningful with an
    // empty token cache.
    const { scanDriveFolder: freshScan } = await freshModule();
    // Every page offers yet another token — only the client-side cap ends
    // paging. 2000-per-page keeps the fixture small while still crossing
    // the 5000 cap mid-page. Routing is origin/pathname-exact (CodeQL
    // js/incomplete-url-substring-sanitization) so the folder-metadata call
    // falls through to its own branch and is asserted too.
    let oauthCalls = 0;
    let listPages = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const parsed = new URL(String(input));
      if (parsed.origin === "https://oauth2.googleapis.com") {
        oauthCalls += 1;
        return jsonResponse({ access_token: "t", expires_in: 3600 });
      }
      if (parsed.pathname === "/drive/v3/files") {
        listPages += 1;
        const files = Array.from({ length: 2000 }, (_, i) => ({
          id: `p${listPages}_${i}`, name: `f${i}.jpg`, mimeType: "image/jpeg",
        }));
        // NOTE: always an object shape ({ files }) — a bare array would make
        // `page.files` undefined and silently drop the whole page.
        return jsonResponse({ nextPageToken: `tok${listPages}`, files });
      }
      if (parsed.pathname === `/drive/v3/files/${FOLDER_ID}`) {
        return jsonResponse({ id: FOLDER_ID, name: "Huge" });
      }
      return jsonResponse({ error: "unmatched" }, 500);
    }));

    const result = await freshScan(FOLDER_ID);
    expect(oauthCalls).toBe(1);
    // Page 1 → 2000, page 2 → 4000, page 3 crosses the cap at photo 5000.
    expect(listPages).toBe(3);
    expect(result.photoCount).toBe(5000);
    expect(result.truncated).toBe(true);
    expect(result.folderId).toBe(FOLDER_ID);
    expect(result.folderName).toBe("Huge");
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
    const { scanDriveFolder: freshScan } = await freshModule();

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
