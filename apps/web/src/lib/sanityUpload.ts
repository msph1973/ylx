// Shared direct-to-Sanity binary upload helpers. Both UploadPage.tsx (main
// proofing gallery upload) and FinalPhotosSection.tsx (final/edited photo
// upload) need to bypass Vercel's ~4.5MB serverless body limit by uploading
// straight to Sanity's asset API from the browser — this used to be two
// independent, byte-for-byte-identical copies of the same helpers.

// Credentials the browser uses to upload the binary straight to Sanity.
// Fetched at runtime from an admin-only endpoint — never bundled into client JS.
export interface UploadCredentials {
  projectId: string;
  dataset: string;
  apiVersion: string;
  token: string;
}

export interface RetryableError extends Error {
  retryable?: boolean;
  status?: number;
}

// 1 initial attempt + up to 2 retries for transient failures.
export const RETRY_BASE_DELAY_MS = 800;
export const MAX_RETRY_DELAY_MS = 30_000; // hard ceiling even if MAX_UPLOAD_ATTEMPTS grows later

export const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Network-layer failures (status 0) and transient server/rate-limit responses are
// worth retrying; 4xx (auth, payload too large, validation) are permanent — a retry
// would only fail again the same way.
export function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

export function makeError(message: string, opts: { retryable: boolean; status?: number }): RetryableError {
  const err = new Error(message) as RetryableError;
  err.retryable = opts.retryable;
  err.status = opts.status;
  return err;
}

// One direct upload attempt of the raw file to Sanity's asset API. Resolves the
// created asset id (`image-...`), or rejects with a RetryableError. XHR is used
// (over fetch) so we get real upload-progress events for the large binary.
export function putAssetToSanity(
  creds: UploadCredentials,
  file: File,
  onProgress: (pct: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url =
      `https://${creds.projectId}.api.sanity.io/v${creds.apiVersion}` +
      `/assets/images/${creds.dataset}?filename=${encodeURIComponent(file.name)}`;

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const assetId = JSON.parse(xhr.responseText)?.document?._id;
          if (typeof assetId === 'string' && assetId) {
            resolve(assetId);
            return;
          }
        } catch {
          /* fall through to reject */
        }
        reject(makeError('Malformed upload response from Sanity', { retryable: true }));
      } else {
        reject(
          makeError(`Sanity upload failed (${xhr.status})`, {
            retryable: isRetryableStatus(xhr.status),
            status: xhr.status,
          }),
        );
      }
    });
    xhr.addEventListener('error', () =>
      reject(makeError('Network error during upload', { retryable: true, status: 0 })),
    );
    xhr.addEventListener('timeout', () =>
      reject(makeError('Upload timed out', { retryable: true, status: 0 })),
    );
    xhr.open('POST', url);
    // No xhr.timeout: large files on a slow connection can legitimately take
    // longer than any fixed timeout, and aborting them mid-upload is worse
    // than just letting them run.
    xhr.setRequestHeader('Authorization', `Bearer ${creds.token}`);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.send(file);
  });
}
