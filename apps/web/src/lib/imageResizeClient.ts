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
  worker?.terminate();
  worker = null;
}

function getWorker(): Worker {
  if (worker) return worker;
  const instance = new Worker(new URL('./imageResize.worker.ts', import.meta.url), { type: 'module' });
  instance.onmessage = (event: MessageEvent<{ id: string; result: ResizeResult }>) => {
    const entry = pending.get(event.data.id);
    if (entry) {
      pending.delete(event.data.id);
      entry.resolve(event.data.result);
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

export function resizeImageInWorker(file: File): Promise<ResizeResult> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (pending.delete(id)) {
        console.warn('resizeImageInWorker: timed out resizing file, uploading original', { fileName: file.name });
        resolve({ file, resized: false });
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
    }
  });
}
