import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resizeImageForUpload, UPLOAD_RESIZE_MAX_DIMENSION, UPLOAD_RESIZE_QUALITY } from "./imageResize";

// jsdom doesn't implement real image decoding or canvas rendering, so
// `createImageBitmap`/`OffscreenCanvas` are mocked at the global level for
// every test in this file — the standard pattern for exercising canvas-based
// browser code without a real renderer.

function makeFile(type: string, size: number, name = "photo.jpg"): File {
  return new File(["x".repeat(size)], name, { type });
}

const createImageBitmapMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("createImageBitmap", createImageBitmapMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  createImageBitmapMock.mockReset();
});

describe("resizeImageForUpload", () => {
  it("skips unsupported formats (e.g. TIFF) without attempting to decode", async () => {
    const file = makeFile("image/tiff", 1000, "photo.tiff");

    const result = await resizeImageForUpload(file);

    expect(result.file).toBe(file);
    expect(result.resized).toBe(false);
    expect(createImageBitmapMock).not.toHaveBeenCalled();
  });

  it("falls back to the original file (metadata not stripped) when no canvas API is available at all", async () => {
    // Neither OffscreenCanvas nor a working `document`-canvas 2D context is
    // stubbed here, and jsdom itself has no real canvas support without the
    // optional `canvas` npm package — so encodeToBlob has nothing to draw
    // with. This is the one remaining case where metadata can't be stripped.
    const closeMock = vi.fn();
    createImageBitmapMock.mockResolvedValue({ width: 800, height: 600, close: closeMock });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const file = makeFile("image/jpeg", 1000);

    const result = await resizeImageForUpload(file);

    expect(result.file).toBe(file);
    expect(result.resized).toBe(false);
    expect(closeMock).toHaveBeenCalled();
  });

  it("re-encodes an already-small image too, so EXIF is stripped even when dimensions don't change", async () => {
    const closeMock = vi.fn();
    createImageBitmapMock.mockResolvedValue({ width: 800, height: 600, close: closeMock });

    const drawImageSpy = vi.fn();
    const strippedBlob = new Blob(["x".repeat(900)], { type: "image/jpeg" });
    const convertToBlobMock = vi.fn().mockResolvedValue(strippedBlob);

    class MockOffscreenCanvas {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      getContext() {
        return { drawImage: drawImageSpy };
      }
      convertToBlob(options: unknown) {
        return convertToBlobMock(options);
      }
    }
    vi.stubGlobal("OffscreenCanvas", MockOffscreenCanvas);

    const file = makeFile("image/jpeg", 1000);

    const result = await resizeImageForUpload(file);

    // Still re-encoded (to strip metadata), even though the pixel dimensions
    // passed to the canvas match the original exactly — no downscale needed.
    expect(result.resized).toBe(true);
    expect(result.file).not.toBe(file);
    expect(result.file.name).toBe(file.name);
    expect(closeMock).toHaveBeenCalled();
    expect(drawImageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ width: 800, height: 600 }),
      0,
      0,
      800,
      600,
    );
  });

  it("downscales a large image and re-encodes it via OffscreenCanvas", async () => {
    const closeMock = vi.fn();
    createImageBitmapMock.mockResolvedValue({ width: 6000, height: 4000, close: closeMock });

    const drawImageSpy = vi.fn();
    // Original file is 100000 bytes; the "resized" blob is much smaller, so
    // the function should accept it as a genuine improvement.
    const smallerBlob = new Blob(["x".repeat(100)], { type: "image/jpeg" });
    const convertToBlobMock = vi.fn().mockResolvedValue(smallerBlob);

    class MockOffscreenCanvas {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      getContext() {
        return { drawImage: drawImageSpy };
      }
      convertToBlob(options: unknown) {
        return convertToBlobMock(options);
      }
    }
    vi.stubGlobal("OffscreenCanvas", MockOffscreenCanvas);

    const file = makeFile("image/jpeg", 100000);

    const result = await resizeImageForUpload(file);

    expect(result.resized).toBe(true);
    expect(result.file).not.toBe(file);
    expect(result.file.name).toBe(file.name);
    expect(closeMock).toHaveBeenCalled();

    // 6000x4000 source, longest edge (6000) scaled down to the 2500px cap:
    // scale = 2500 / 6000, width = round(6000 * scale) = 2500,
    // height = round(4000 * scale) = round(1666.67) = 1667.
    const scale = UPLOAD_RESIZE_MAX_DIMENSION / 6000;
    const expectedWidth = Math.round(6000 * scale);
    const expectedHeight = Math.round(4000 * scale);
    expect(expectedWidth).toBe(2500);
    expect(expectedHeight).toBe(1667);
    expect(drawImageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ width: 6000, height: 4000 }),
      0,
      0,
      expectedWidth,
      expectedHeight,
    );
    expect(convertToBlobMock).toHaveBeenCalledWith({ type: "image/jpeg", quality: UPLOAD_RESIZE_QUALITY });
  });

  it("still uses the re-encoded file even when it isn't smaller than the original, since stripping metadata takes priority over saving bytes", async () => {
    createImageBitmapMock.mockResolvedValue({ width: 6000, height: 4000, close: vi.fn() });

    const notSmallerBlob = new Blob(["x".repeat(200000)], { type: "image/jpeg" });
    class MockOffscreenCanvas {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext() {
        return { drawImage: vi.fn() };
      }
      convertToBlob() {
        return Promise.resolve(notSmallerBlob);
      }
    }
    vi.stubGlobal("OffscreenCanvas", MockOffscreenCanvas);

    const file = makeFile("image/jpeg", 100000);

    const result = await resizeImageForUpload(file);

    expect(result.file).not.toBe(file);
    expect(result.file.size).toBe(notSmallerBlob.size);
    expect(result.resized).toBe(true);
  });

  it("resolves gracefully (never throws) when createImageBitmap rejects", async () => {
    createImageBitmapMock.mockRejectedValue(new Error("decode failed"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const file = makeFile("image/png", 1000);

    const result = await resizeImageForUpload(file);

    expect(result.file).toBe(file);
    expect(result.resized).toBe(false);
  });

  it("requests EXIF-aware decoding via imageOrientation: 'from-image'", async () => {
    createImageBitmapMock.mockResolvedValue({ width: 800, height: 600, close: vi.fn() });
    const file = makeFile("image/jpeg", 1000);

    await resizeImageForUpload(file);

    expect(createImageBitmapMock).toHaveBeenCalledWith(file, { imageOrientation: "from-image" });
  });
});
