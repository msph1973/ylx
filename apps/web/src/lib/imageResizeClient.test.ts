import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// jsdom has no real Worker implementation, so `global.Worker` is stubbed with a
// minimal fake that captures the constructed instance and lets tests trigger
// `onmessage` manually to simulate the worker's response.
class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
}

let lastWorkerInstance: MockWorker | null = null;

function makeFile(name = "photo.jpg"): File {
  return new File(["x"], name, { type: "image/jpeg" });
}

beforeEach(() => {
  vi.resetModules();
  lastWorkerInstance = null;
  vi.stubGlobal(
    "Worker",
    class extends MockWorker {
      constructor() {
        super();
        lastWorkerInstance = this;
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("resizeImageInWorker", () => {
  it("posts a message to the worker and resolves with its response", async () => {
    const { resizeImageInWorker } = await import("./imageResizeClient");
    const file = makeFile();

    const promise = resizeImageInWorker(file);

    expect(lastWorkerInstance).not.toBeNull();
    expect(lastWorkerInstance!.postMessage).toHaveBeenCalledTimes(1);
    const [message] = lastWorkerInstance!.postMessage.mock.calls[0];
    expect(message.file).toBe(file);
    expect(typeof message.id).toBe("string");

    lastWorkerInstance!.onmessage?.({
      data: { id: message.id, result: { file, resized: false } },
    } as MessageEvent);

    await expect(promise).resolves.toEqual({ file, resized: false });
  });

  it("reuses the same worker instance and correlates concurrent requests by id", async () => {
    const { resizeImageInWorker } = await import("./imageResizeClient");
    const file1 = makeFile("a.jpg");
    const file2 = makeFile("b.jpg");

    const p1 = resizeImageInWorker(file1);
    const p2 = resizeImageInWorker(file2);
    const worker = lastWorkerInstance!;

    // A single Worker handled both requests.
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    const [msg1] = worker.postMessage.mock.calls[0];
    const [msg2] = worker.postMessage.mock.calls[1];
    expect(msg1.id).not.toBe(msg2.id);

    // Respond out of order — the promises must still resolve with the right file.
    worker.onmessage?.({ data: { id: msg2.id, result: { file: file2, resized: true } } } as MessageEvent);
    worker.onmessage?.({ data: { id: msg1.id, result: { file: file1, resized: false } } } as MessageEvent);

    await expect(p2).resolves.toEqual({ file: file2, resized: true });
    await expect(p1).resolves.toEqual({ file: file1, resized: false });
  });

  it("falls back to the original file if the worker never responds", async () => {
    vi.useFakeTimers();
    const { resizeImageInWorker } = await import("./imageResizeClient");
    const file = makeFile();

    const promise = resizeImageInWorker(file);
    await vi.advanceTimersByTimeAsync(30_000);

    await expect(promise).resolves.toEqual({ file, resized: false });
  });

  it("falls back to the original file when the worker throws while dispatching", async () => {
    const { resizeImageInWorker } = await import("./imageResizeClient");
    const file = makeFile();
    lastWorkerInstance = null;
    vi.stubGlobal(
      "Worker",
      class extends MockWorker {
        constructor() {
          super();
          this.postMessage = vi.fn(() => {
            throw new Error("postMessage failed");
          });
          lastWorkerInstance = this;
        }
      },
    );

    await expect(resizeImageInWorker(file)).resolves.toEqual({ file, resized: false });
  });

  it("falls back to the original file when constructing the worker throws", async () => {
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new Error("Worker construction not supported");
        }
      },
    );
    const { resizeImageInWorker } = await import("./imageResizeClient");
    const file = makeFile();

    await expect(resizeImageInWorker(file)).resolves.toEqual({ file, resized: false });
  });

  it("resolves in-flight requests with their own original file and rebuilds the worker after a crash", async () => {
    const { resizeImageInWorker } = await import("./imageResizeClient");
    const file1 = makeFile("a.jpg");
    const file2 = makeFile("b.jpg");

    const p1 = resizeImageInWorker(file1);
    const p2 = resizeImageInWorker(file2);
    const crashedWorker = lastWorkerInstance!;

    crashedWorker.onerror?.({} as ErrorEvent);

    await expect(p1).resolves.toEqual({ file: file1, resized: false });
    await expect(p2).resolves.toEqual({ file: file2, resized: false });
    expect(crashedWorker.terminate).toHaveBeenCalledTimes(1);

    // The next request must not reuse the dead instance.
    const file3 = makeFile("c.jpg");
    void resizeImageInWorker(file3);
    expect(lastWorkerInstance).not.toBe(crashedWorker);
  });
});
