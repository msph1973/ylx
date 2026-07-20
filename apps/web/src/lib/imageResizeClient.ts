import type { ResizeResult } from './imageResize';

// Every resize request is handled by a single, lazily-created Worker. Resize is
// CPU-bound (decode + re-encode) and much faster than the network-bound upload it
// feeds into, so one worker easily keeps up with the batch upload's concurrency
// (see UPLOAD_CONCURRENCY in UploadPage.tsx) without needing a full worker pool.
let worker: Worker | null = null;
const pending = new Map<string, (result: ResizeResult) => void>();

// If the worker never responds (crashed, killed by the browser, etc.), don't leave
// the caller stuck forever in a "resizing" state — fall back to the original file.
const RESIZE_TIMEOUT_MS = 30_000;

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./imageResize.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<{ id: string; result: ResizeResult }>) => {
    const resolve = pending.get(event.data.id);
    if (resolve) {
      pending.delete(event.data.id);
      resolve(event.data.result);
    }
  };
  return worker;
}

export function resizeImageInWorker(file: File): Promise<ResizeResult> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (pending.delete(id)) {
        console.warn(`resizeImageInWorker: timed out resizing "${file.name}", uploading original`);
        resolve({ file, resized: false });
      }
    }, RESIZE_TIMEOUT_MS);

    pending.set(id, (result) => {
      clearTimeout(timer);
      resolve(result);
    });

    getWorker().postMessage({ id, file });
  });
}
