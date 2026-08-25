// Google Drive read-only metadata helper (Drive-storage albums).
//
// Photos for Drive-backed albums live in the photographer's Google Drive;
// Sanity stores only lightweight `photo` documents that reference them by
// `driveFileId`. This module is the single place that talks to the Drive API:
//
//   extractFolderId()  – parse an admin-pasted share link into a folder id
//   scanDriveFolder()  – list a folder's images via Drive API v3
//
// Auth is a service-account JWT exchanged for a short-lived access token.
// The token is cached at module level: on Vercel Fluid compute a warm
// instance serves many requests, so one OAuth exchange covers ~1h of scans.

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const TOKEN_URI = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";

import { MAX_DRIVE_PHOTOS } from "./albumValidation";

/** Share-link folder ids are Drive's opaque base64url-ish strings; anything
 *  outside this shape never reaches the API query. Exported for the album
 *  create route, which validates client-supplied driveFolderId/photo ids. */
export const FOLDER_ID_PATTERN = /^[a-zA-Z0-9_-]{10,128}$/;

/** Thumbnail/view URL for a Drive file. Only fixed `sz=` steps exist
 *  (w200/w400/w600/w1600/w2000) — no arbitrary transforms, no srcSet.
 *  `resourceKey` is required for files whose link-sharing carries one —
 *  without it thumbnails/downloads 403 even though the link "works" in a
 *  browser tab where Google attaches it via referrer. */
export function driveThumbUrl(fileId: string, width: number, resourceKey?: string | null): string {
  const base = `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`;
  return resourceKey ? `${base}&resourcekey=${encodeURIComponent(resourceKey)}` : base;
}

/** Direct-download navigation link. Drive sends no CORS headers, so clients
 *  must open this as a link (navigation), never fetch() it. */
export function driveDownloadUrl(fileId: string, resourceKey?: string | null): string {
  const base = `https://drive.google.com/uc?export=download&id=${fileId}`;
  return resourceKey ? `${base}&resourcekey=${encodeURIComponent(resourceKey)}` : base;
}

/** Deliberately-curated scan failures (bad link, sharing problem, rate
 *  limit…). The API layer trusts these messages enough to show them to the
 *  authenticated admin verbatim; anything else is treated as an unexpected
 *  bug and scrubbed before responding. */
export class DriveScanError extends Error {}

export function extractFolderId(url: string): string | null {
  // Host-anchored so a random site's /folders/ path is never mistaken for a
  // Drive link (and pasted URLs are normalized by the browser anyway).
  const match = url.match(/drive\.google\.com\/drive\/folders\/([a-zA-Z0-9_-]{10,128})/);
  return match ? (match[1] as string) : null;
}

export interface ScannedPhoto {
  id: string;
  name: string;
  size: number | null;
  width: number | null;
  height: number | null;
  /** Link-sharing resource key — required in thumbnail/download URLs for
   *  files whose sharing mode carries one, absent (null) otherwise. */
  resourceKey: string | null;
}

export interface DriveScanResult {
  folderId: string;
  folderName: string;
  photoCount: number;
  /** True when the folder holds more photos than MAX_DRIVE_PHOTOS — the
   *  list was cut at the cap so create-album validation can never reject
   *  what the preview just showed. */
  truncated: boolean;
  photos: ScannedPhoto[];
}

interface DriveApiFile {
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  resourceKey?: string;
  imageMediaMetadata?: { width?: number; height?: number };
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

function b64urlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // Vercel env vars store the PEM with literal "\n" sequences; normalize both
  // that and real newlines into the bare base64 body crypto.subtle needs.
  const base64 = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
  return crypto.subtle.importKey(
    "pkcs8",
    buffer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.accessToken;
  }

  const clientEmail = process.env.GDRIVE_CLIENT_EMAIL;
  const privateKey = process.env.GDRIVE_PRIVATE_KEY;
  if (!clientEmail || !privateKey) {
    throw new DriveScanError("Google Drive integration is not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const payload = `${b64urlFromBytes(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })))}.${b64urlFromBytes(
    encoder.encode(
      JSON.stringify({
        iss: clientEmail,
        scope: SCOPE,
        aud: TOKEN_URI,
        iat: now,
        exp: now + 3600,
      })
    )
  )}`;

  const key = await importPrivateKey(privateKey);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(payload));
  const assertion = `${payload}.${b64urlFromBytes(new Uint8Array(signature))}`;

  const response = await fetch(TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new DriveScanError("Google Drive credentials were rejected — check the service account configuration");
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

/** Maps Drive error statuses to operator-actionable messages. These surface in
 *  the admin scan modal, so they name the likely fix (usually sharing). */
async function assertDriveOk(response: Response): Promise<void> {
  if (response.ok) return;
  if (response.status === 404) {
    throw new DriveScanError("Google Drive folder not found or not shared with the service account");
  }
  if (response.status === 403) {
    throw new DriveScanError("Access denied to Google Drive folder — check sharing permissions");
  }
  if (response.status === 429) {
    throw new DriveScanError("Google Drive API rate limit reached, try again later");
  }
  throw new DriveScanError(`Google Drive API error (${response.status})`);
}

async function driveFetch(path: string, params: Record<string, string>): Promise<Response> {
  const accessToken = await getAccessToken();
  const url = new URL(`${DRIVE_API_BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000),
  });
}

export async function scanDriveFolder(folderId: string): Promise<DriveScanResult> {
  if (!FOLDER_ID_PATTERN.test(folderId)) {
    throw new DriveScanError("Invalid Google Drive folder id");
  }

  const metaResponse = await driveFetch(`files/${folderId}`, { fields: "id,name" });
  await assertDriveOk(metaResponse);
  const meta = (await metaResponse.json()) as { id: string; name: string };

  interface FilesPage {
    nextPageToken?: string;
    files?: DriveApiFile[];
  }

  const photos: ScannedPhoto[] = [];
  let truncated = false;
  let pageToken: string | undefined;
  do {
    const params: Record<string, string> = {
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType,size,resourceKey,imageMediaMetadata(width,height))",
      pageSize: "1000",
      orderBy: "name",
    };
    if (pageToken) params.pageToken = pageToken;

    const pageResponse = await driveFetch("files", params);
    await assertDriveOk(pageResponse);
    const page = (await pageResponse.json()) as FilesPage;

    for (const file of page.files ?? []) {
      if (photos.length >= MAX_DRIVE_PHOTOS) {
        // Same bound create-album enforces — the preview can never show a
        // list the submit step would then reject.
        truncated = true;
        break;
      }
      photos.push({
        id: file.id,
        name: file.name,
        size: file.size ? Number.parseInt(file.size, 10) || null : null,
        width: file.imageMediaMetadata?.width ?? null,
        height: file.imageMediaMetadata?.height ?? null,
        resourceKey: file.resourceKey ?? null,
      });
    }
    // Cap hit exactly at a page boundary: the next token exists but must
    // not trigger another Drive request — the result is already truncated.
    if (page.nextPageToken && photos.length >= MAX_DRIVE_PHOTOS) {
      truncated = true;
    }
    pageToken = truncated ? undefined : page.nextPageToken;
  } while (pageToken);
  return {
    folderId: meta.id,
    folderName: meta.name,
    photoCount: photos.length,
    truncated,
    photos,
  };
}
