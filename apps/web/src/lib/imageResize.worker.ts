// Runs `resizeImageForUpload` off the main thread. Several large photos can
// be resizing concurrently at once (upload concurrency cap is 3, see
// `UploadPage.tsx`), and decoding/re-encoding full-res JPEGs on the main
// thread would freeze the UI for the duration — this Worker keeps that work
// entirely off it.

import { resizeImageForUpload, type ResizeResult } from './imageResize';

interface ResizeWorkerRequest {
  id: string;
  file: File;
}

interface ResizeWorkerResponse {
  id: string;
  result: ResizeResult;
}

// The project's tsconfig only pulls in the DOM lib (not the separate
// "webworker" lib), so there's no `DedicatedWorkerGlobalScope` type available
// here — type just the two APIs this file actually uses instead.
interface ResizeWorkerSelf {
  onmessage: ((event: MessageEvent<ResizeWorkerRequest>) => void) | null;
  postMessage: (message: ResizeWorkerResponse) => void;
}

const workerSelf = self as unknown as ResizeWorkerSelf;

workerSelf.onmessage = async (event) => {
  const { id, file } = event.data;
  try {
    const result = await resizeImageForUpload(file);
    workerSelf.postMessage({ id, result });
  } catch (error) {
    // Belt-and-suspenders: `resizeImageForUpload` itself should never throw,
    // but if it somehow does, still respond so the main thread's request
    // doesn't hang forever waiting for this id. Filename is passed as a
    // structured field (not interpolated into the message) so a crafted
    // filename can't be misread as a console format-string directive.
    console.warn('imageResize.worker: failed to resize file, using original', { fileName: file.name, error });
    workerSelf.postMessage({ id, result: { file, resized: false } });
  }
};

export {};
