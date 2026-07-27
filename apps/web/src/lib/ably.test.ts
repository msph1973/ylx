import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const publishMock = vi.fn();
const channelsGetMock = vi.fn(() => ({ publish: publishMock }));
// `function` (not arrow) so `new AblyModule.default.Rest({ key })` works.
const restConstructorMock = vi.fn(function () {
  return { channels: { get: channelsGetMock } };
});

vi.mock("ably", () => ({
  default: {
    Rest: restConstructorMock,
  },
}));

describe("publishAdminEvent / publishAlbumEvent (server-side publish)", () => {
  beforeEach(() => {
    vi.resetModules();
    publishMock.mockReset().mockResolvedValue(undefined);
    channelsGetMock.mockClear();
    restConstructorMock.mockClear();
    process.env.ABLY_API_KEY = "test-key:secret";
  });

  afterEach(() => {
    delete process.env.ABLY_API_KEY;
    vi.restoreAllMocks();
  });

  it("awaits the publish and sends event + data to the admin channel", async () => {
    const { publishAdminEvent } = await import("./ably");

    await publishAdminEvent("album:created", { albumId: "a1" });

    expect(channelsGetMock).toHaveBeenCalledWith("admin:updates");
    expect(publishMock).toHaveBeenCalledWith("album:created", { albumId: "a1" });
  });

  it("publishes to the album-scoped channel with default empty data", async () => {
    const { publishAlbumEvent } = await import("./ably");

    await publishAlbumEvent("a1", "album:locked");

    expect(channelsGetMock).toHaveBeenCalledWith("album:a1");
    expect(publishMock).toHaveBeenCalledWith("album:locked", {});
  });

  it("is a no-op when ABLY_API_KEY is missing", async () => {
    delete process.env.ABLY_API_KEY;
    const { publishAdminEvent } = await import("./ably");

    await publishAdminEvent("album:created");

    expect(restConstructorMock).not.toHaveBeenCalled();
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("logs a publish rejection and does not throw", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("ably down");
    publishMock.mockRejectedValueOnce(failure);
    const { publishAdminEvent } = await import("./ably");

    await expect(publishAdminEvent("album:updated", { albumId: "a1" })).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      "[ably] publish failed",
      { channel: "admin:updates", eventType: "album:updated" },
      failure
    );
  });

  it("reuses one Rest client across multiple publishes", async () => {
    const { publishAdminEvent, publishAlbumEvent } = await import("./ably");

    await publishAdminEvent("e1");
    await publishAlbumEvent("a1", "e2");

    expect(restConstructorMock).toHaveBeenCalledTimes(1);
  });
});
