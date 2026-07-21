// Client-side image resize/compress that runs BEFORE upload, to cut upload
// time/size for large full-res photos. Deliberately kept DOM-free (no
// `document`/`window` references outside one explicit feature-detected
// fallback) so this exact module can run unchanged either on the main thread
// or inside `imageResize.worker.ts` — resizing several photos at once (upload
// concurrency cap is 3, see `UploadPage.tsx`) must never freeze the UI.

export const UPLOAD_RESIZE_MAX_DIMENSION = 2500; // px, cap on the image's longest edge
export const UPLOAD_RESIZE_QUALITY = 0.85; // 0-1, used when re-encoding JPEG/WebP

export interface ResizeResult {
  file: File; // resized file, OR the original file unchanged if resize was skipped/failed
  resized: boolean; // true only if the file was actually re-encoded/downsized
}

// Browsers can't reliably re-encode TIFF (or anything canvas doesn't natively
// decode) via canvas, so only attempt the formats that round-trip cleanly.
const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Draws the (already-decoded) bitmap at the target size and re-encodes it.
// Prefers OffscreenCanvas since it's the only canvas API available inside a
// Worker; falls back to a real <canvas> only when we're on the main thread.
// Does NOT close the bitmap — the caller owns its whole lifecycle (see the
// `finally` in `resizeImageForUpload`) so it's freed exactly once regardless
// of which path returns or throws.
async function encodeToBlob(
  bitmap: ImageBitmap,
  targetWidth: number,
  targetHeight: number,
  type: string,
): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    return canvas.convertToBlob({ type, quality: UPLOAD_RESIZE_QUALITY });
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    return new Promise((resolve) => {
      canvas.toBlob(resolve, type, UPLOAD_RESIZE_QUALITY);
    });
  }

  // Neither OffscreenCanvas nor a DOM `document` is available (e.g. an old
  // browser inside a Worker with no OffscreenCanvas support) — nothing left
  // to draw with. Let the caller's try/catch handle it like any other
  // decode/encode failure.
  throw new Error('No canvas API available to resize image');
}

export async function resizeImageForUpload(file: File): Promise<ResizeResult> {
  if (!SUPPORTED_TYPES.has(file.type)) {
    return { file, resized: false };
  }

  // Declared outside the try block so the `finally` below can always close it,
  // regardless of which branch returns or throws (fixes a decoded-bitmap leak
  // on every early-return/throw path that used to close it ad hoc).
  let bitmap: ImageBitmap | null = null;
  try {
    // `imageOrientation: 'from-image'` makes the decoded bitmap respect
    // embedded EXIF orientation the same way an `<img>` tag does — the
    // default ignores it, which would rotate phone-shot photos after resize.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

    if (bitmap.width <= UPLOAD_RESIZE_MAX_DIMENSION && bitmap.height <= UPLOAD_RESIZE_MAX_DIMENSION) {
      // Already small enough — don't re-encode and lose quality for nothing.
      return { file, resized: false };
    }

    const scale = UPLOAD_RESIZE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height);
    const targetWidth = Math.round(bitmap.width * scale);
    const targetHeight = Math.round(bitmap.height * scale);

    const blob = await encodeToBlob(bitmap, targetWidth, targetHeight, file.type);

    if (!blob || blob.size >= file.size) {
      // Re-encoding didn't actually save anything (or failed) — use original.
      return { file, resized: false };
    }

    // Same filename — must stay byte-identical for Lightroom filename
    // matching later on; only the pixel bytes change.
    const resizedFile = new File([blob], file.name, { type: file.type, lastModified: file.lastModified });
    return { file: resizedFile, resized: true };
  } catch (error) {
    // Never throw, never block the caller — worst case we just upload the
    // original, full-size file. Filename is passed as a structured field
    // (not interpolated into the message) so a crafted filename can't be
    // misread as a console format-string directive.
    console.warn('resizeImageForUpload: failed to resize file, using original', { fileName: file.name, error });
    return { file, resized: false };
  } finally {
    bitmap?.close();
  }
}
