import type { ResizeResult } from './imageResize';

// Every resize request is handled by a single, lazily-created Worker. Resize is
// CPU-bound (decode + re-encode) and much faster than the network-bound upload it
// feeds into, so one worker easily keeps up with the batch upload's concurrency
// (see UPLOAD_CONCURRENCY in UploadPage.tsx) without needing a full worker pool.
let worker: Worker | null = null;

interface PendingResize {
  file: File;
  resolve: (result: ResizeResult) => void;
}

const pending = new Map<string, PendingResize>();

// If the worker never responds (crashed, killed by the browser, etc.), don't leave
// the caller stuck forever in a "resizing" state — fall back to the original file.
const RESIZE_TIMEOUT_MS = 30_000;

// Once every pending resize has settled, the worker used to be kept around
// for the rest of the upload page's lifetime (only a crash ever tore it
// down), holding its decode buffers alive the whole time. Instead, terminate
// it after a brief grace period once the queue is empty — long enough that a
// fast follow-up batch (e.g. the user immediately selects more photos) reuses
// the same instance instead of paying to spawn (and re-fetch the module
// script for) a new one on every batch.
const WORKER_IDLE_TERMINATE_MS = 5_000;
let idleTerminateTimer: ReturnType<typeof setTimeout> | null = null;

function cancelIdleTermination(): void {
  if (idleTerminateTimer !== null) {
    clearTimeout(idleTerminateTimer);
    idleTerminateTimer = null;
  }
}

function scheduleIdleTerminationIfEmpty(): void {
  if (pending.size > 0) return;
  cancelIdleTermination();
  idleTerminateTimer = setTimeout(() => {
    idleTerminateTimer = null;
    // Only tear down if nothing queued a new request while we waited.
    if (pending.size === 0) {
      worker?.terminate();
      worker = null;
    }
  }, WORKER_IDLE_TERMINATE_MS);
  // Don't block Node/test process exit waiting for this timer (no-op in a
  // real browser, where the returned handle has no `unref`).
  if (idleTerminateTimer.unref) idleTerminateTimer.unref();
}

// A worker that crashed (onerror) or sent an undeliverable message
// (onmessageerror) is unusable for any request still waiting on it — settle
// every one of them with its own original file right away (instead of making
// each wait out the full RESIZE_TIMEOUT_MS against a dead worker), then drop
// the instance so the next call builds a fresh one.
function failAllPending(): void {
  for (const { file, resolve } of pending.values()) {
    resolve({ file, resized: false });
  }
  pending.clear();
  cancelIdleTermination();
  worker?.terminate();
  worker = null;
}

function getWorker(): Worker {
  // Reusing (or about to (re)build) the worker — either way, any previously
  // scheduled idle-termination for it is no longer relevant.
  cancelIdleTermination();
  if (worker) return worker;
  const instance = new Worker(new URL('./imageResize.worker.ts', import.meta.url), { type: 'module' });
  instance.onmessage = (event: MessageEvent<{ id: string; result: ResizeResult }>) => {
    const entry = pending.get(event.data.id);
    if (entry) {
      pending.delete(event.data.id);
      entry.resolve(event.data.result);
      scheduleIdleTerminationIfEmpty();
    }
  };
  instance.onerror = () => {
    console.warn('imageResizeClient: worker crashed, falling back to originals for in-flight resizes');
    failAllPending();
  };
  instance.onmessageerror = () => {
    console.warn('imageResizeClient: worker sent an undeliverable message, falling back to originals for in-flight resizes');
    failAllPending();
  };
  worker = instance;
  return worker;
}

// Free the worker immediately on page teardown rather than waiting out the
// idle grace period for nothing — `pagehide` fires reliably on navigation,
// tab close, and (unlike `beforeunload`) bfcache-eligible backgrounding.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    cancelIdleTermination();
    worker?.terminate();
    worker = null;
  });
}

export function resizeImageInWorker(file: File): Promise<ResizeResult> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (pending.delete(id)) {
        console.warn('resizeImageInWorker: timed out resizing file, uploading original', { fileName: file.name });
        resolve({ file, resized: false });
        scheduleIdleTerminationIfEmpty();
      }
    }, RESIZE_TIMEOUT_MS);

    pending.set(id, {
      file,
      resolve: (result) => {
        clearTimeout(timer);
        resolve(result);
      },
    });

    try {
      getWorker().postMessage({ id, file });
    } catch (error) {
      // `new Worker(...)` / `postMessage(...)` can throw synchronously (no
      // module-worker support, non-cloneable message, etc.) — never let that
      // reject this promise and abort the caller's upload loop.
      clearTimeout(timer);
      pending.delete(id);
      console.warn('resizeImageInWorker: failed to dispatch to worker, uploading original', { fileName: file.name, error });
      resolve({ file, resized: false });
      scheduleIdleTerminationIfEmpty();
    }
  });
}
