import { describe, it, expect, vi, beforeEach } from "vitest";

// S2 Task 3 (tenant scoping): vendors must only see their own albums
// (album.owner._ref == session.ownerId); cross-vendor access is 404 (not
// 403, anti-enumeration); superadmins see everything including ownerless
// legacy albums; POST create ignores any client-sent owner and forces
// session.ownerId server-side.

const requireAdminMock = vi.fn();
const sanityFetchMock = vi.fn();
const sanityCreateMock = vi.fn();
const sanityPatchMock = vi.fn();
const sanityMutateMock = vi.fn();
const sanityTransactionMock = vi.fn();
const publishAdminEventMock = vi.fn();
const publishAlbumEventMock = vi.fn();
const getCachedMock = vi.fn();
const cacheGetRawMock = vi.fn();
const invalidateCacheMock = vi.fn();
const captureErrorMock = vi.fn();
const cascadeDeleteAlbumsMock = vi.fn();
const generateUniqueSlugMock = vi.fn();
const resolveCustomSlugMock = vi.fn();
const releaseSlugLockMock = vi.fn();

vi.mock("../../../lib/auth", () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
}));
vi.mock("../../../lib/ably", () => ({
  publishAdminEvent: (...args: unknown[]) => publishAdminEventMock(...args),
  publishAlbumEvent: (...args: unknown[]) => publishAlbumEventMock(...args),
}));
vi.mock("../../../lib/cache", () => ({
  getCached: (...args: unknown[]) => getCachedMock(...args),
  cacheGetRaw: (...args: unknown[]) => cacheGetRawMock(...args),
  invalidateCache: (...args: unknown[]) => invalidateCacheMock(...args),
  CACHE_KEYS: {
    albumsList: (): string => "cache:admin:albums:list",
    albumSelections: (albumId: string): string => `cache:admin:selections:${albumId}`,
    albumBySlug: (slug: string): string => `cache:gallery:album:${slug}`,
    adminSessionVersion: (adminId: string): string => `cache:admin:session-version:${adminId}`,
    galleryDraft: (albumId: string): string => `draft:gallery:${albumId}`,
  },
}));
vi.mock("../../../lib/errorTracking", () => ({
  captureError: (...args: unknown[]) => captureErrorMock(...args),
}));
vi.mock("../../../lib/slug", () => ({
  generateUniqueSlug: (...args: unknown[]) => generateUniqueSlugMock(...args),
  resolveCustomSlug: (...args: unknown[]) => resolveCustomSlugMock(...args),
  releaseSlugLock: (...args: unknown[]) => releaseSlugLockMock(...args),
}));
vi.mock("../../../lib/albumDeletion", () => ({
  cascadeDeleteAlbums: (...args: unknown[]) => cascadeDeleteAlbumsMock(...args),
}));
vi.mock("../../../lib/gdrive", () => ({
  driveThumbUrl: () => "https://drive.test/thumb",
  FOLDER_ID_PATTERN: /^[A-Za-z0-9_-]{10,}$/,
}));
vi.mock("@ylx/sanity/client", () => ({
  sanityClient: { fetch: (...args: unknown[]) => sanityFetchMock(...args) },
  sanityWriteClient: {
    create: (...args: unknown[]) => sanityCreateMock(...args),
    patch: (...args: unknown[]) => sanityPatchMock(...args),
    mutate: (...args: unknown[]) => sanityMutateMock(...args),
    transaction: (...args: unknown[]) => sanityTransactionMock(...args),
  },
  urlFor: () => ({ auto: () => ({ quality: () => ({ url: () => "https://cdn.test/img.jpg" }) }) }),
}));
vi.mock("@ylx/sanity/lib/thumbnails", () => ({
  thumbnailUrl: () => "https://cdn.test/t.jpg",
  thumbnailSrcSet: () => "https://cdn.test/t.jpg 400w",
}));

import { GET as listGet, POST as listPost } from "./albums";
import { GET as detailGet, PUT as detailPut, DELETE as detailDelete } from "./albums/[id]/index";
import { POST as lockPost } from "./albums/[id]/lock";
import { POST as unlockPost } from "./albums/[id]/unlock";
import { POST as resetPost } from "./albums/[id]/reset";
import { PATCH as reorderPatch } from "./albums/[id]/reorder";
import { DELETE as photoDelete } from "./photos/[id]";
import { POST as photosBulkDelete } from "./photos/bulk-delete";
import { POST as albumsBulkDelete } from "./albums/bulk-delete";

// --- fixtures (frozen S2 session contract) ---------------------------------

const V1 = {
  id: "admin.v1",
  email: "v1@example.com",
  name: "Vendor Satu",
  role: "vendor",
  ownerId: "admin.v1",
  expiresAt: Date.now() + 86_400_000,
  sessionVersion: 1,
};
const V2 = {
  id: "admin.v2",
  email: "v2@example.com",
  name: "Vendor Dua",
  role: "vendor",
  ownerId: "admin.v2",
  expiresAt: Date.now() + 86_400_000,
  sessionVersion: 1,
};
const SUPER = {
  id: "admin.root",
  email: "root@example.com",
  name: "Superadmin",
  role: "superadmin",
  ownerId: "admin.root",
  expiresAt: Date.now() + 86_400_000,
  sessionVersion: 1,
};

function ownedAlbum(id: string, ownerId: string, extra: Record<string, unknown> = {}) {
  return {
    _id: id,
    title: `Title ${id}`,
    clientName: "Client",
    eventDate: "2030-01-01",
    pin: "1111",
    slug: { current: `slug-${id}` },
    customSlug: undefined,
    maxSelections: 5,
    status: "active",
    vendorName: "Vendor",
    photos: [],
    owner: { _ref: ownerId, _type: "reference" as const },
    ...extra,
  };
}
const albumA = () => ownedAlbum("album-a", "admin.v1");
const albumB = () => ownedAlbum("album-b", "admin.v2");
// Legacy album: no owner field at all (pre-S2 data).
const albumLegacy = () => {
  const { owner: _dropped, ...rest } = ownedAlbum("album-legacy", "admin.v1");
  void _dropped;
  return rest;
};

function jsonRequest(body: unknown): Request {
  return new Request("https://test.local/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Routes fetch by query shape; steer every fetch in a test to the fixture
// matching its shape so each endpoint test only sets up what it needs.
interface OwnerFixture {
  _id?: string;
  owner?: { _ref?: string };
}
function routeFetch(opts: {
  single?: unknown;
  many?: unknown[];
  photo?: unknown;
  photos?: unknown[];
  list?: OwnerFixture[];
  pins?: OwnerFixture[];
} = {}) {
  // Emulate Sanity server-side: an owner-filtered query only matches docs
  // whose owner._ref equals the bound $ownerId (ownerless docs match none).
  function applyOwnerFilter(query: string, docs: OwnerFixture[], params: unknown): OwnerFixture[] {
    if (!query.includes("owner._ref == $ownerId")) return docs;
    const ownerId =
      params !== null && typeof params === "object" && "ownerId" in params
        ? params.ownerId
        : undefined;
    return docs.filter((doc) => doc.owner?._ref === ownerId);
  }
  sanityFetchMock.mockImplementation((query: unknown, params: unknown) => {
    const q = String(query);
    if (q.includes('_type == "photo"') && q.includes("_id == $photoId")) {
      return Promise.resolve(opts.photo ?? null);
    }
    if (q.includes('_type == "photo"') && q.includes("_id in $photoIds")) {
      return Promise.resolve(opts.photos ?? []);
    }
    if (q.includes("_id in $ids")) {
      return Promise.resolve(opts.many ?? []);
    }
    // Album branches come before the selection/submission branch: the list
    // queries embed a selection-count subquery, so they contain the
    // selection marker too.
    if (q.includes('_type == "album"') && q.includes("{ _id, pin }")) {
      return Promise.resolve(applyOwnerFilter(q, opts.pins ?? [], params));
    }
    if (q.includes('_type == "album"') && q.includes("_id ==")) {
      return Promise.resolve(opts.single ?? null);
    }
    if (q.includes('_type == "album"')) {
      return Promise.resolve(applyOwnerFilter(q, opts.list ?? [], params));
    }
    if (q.includes('_type == "selection"') || q.includes('_type == "submission"')) {
      return Promise.resolve([]);
    }
    return Promise.resolve(null);
  });
}

beforeEach(() => {
  requireAdminMock.mockReset().mockResolvedValue(V1);
  sanityFetchMock.mockReset();
  sanityCreateMock.mockReset().mockImplementation((doc: unknown) => Promise.resolve(doc));
  sanityMutateMock.mockReset().mockResolvedValue([]);
  sanityPatchMock.mockReset().mockImplementation(() => ({
    set: () => ({
      unset: () => ({ commit: () => Promise.resolve({ _id: "album-a" }) }),
      commit: () => Promise.resolve({ _id: "album-a" }),
    }),
  }));
  sanityTransactionMock.mockReset().mockImplementation(() => {
    const tx = {
      create: vi.fn(() => tx),
      patch: vi.fn(() => tx),
      delete: vi.fn(() => tx),
      commit: vi.fn(() => Promise.resolve({})),
    };
    return tx;
  });
  publishAdminEventMock.mockReset().mockResolvedValue(undefined);
  publishAlbumEventMock.mockReset().mockResolvedValue(undefined);
  // getCached passthrough: run the fetcher so list tests observe the query.
  getCachedMock.mockReset().mockImplementation((_k: unknown, _a: unknown, _b: unknown, fn: unknown) =>
    (fn as () => unknown)()
  );
  cacheGetRawMock.mockReset().mockResolvedValue([]);
  invalidateCacheMock.mockReset().mockResolvedValue(undefined);
  captureErrorMock.mockReset();
  cascadeDeleteAlbumsMock.mockReset().mockResolvedValue({ deleted: 1 });
  generateUniqueSlugMock.mockReset().mockResolvedValue("test-slug");
  resolveCustomSlugMock.mockReset().mockResolvedValue("custom-x");
  releaseSlugLockMock.mockReset().mockResolvedValue(undefined);
});

async function statusOf(res: Response): Promise<{ status: number; body: Record<string, unknown> }> {
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

// --- GET /api/admin/albums --------------------------------------------------

describe("GET /api/admin/albums tenant scope", () => {
  it("vendor only receives own albums", async () => {
    requireAdminMock.mockResolvedValue(V1);
    routeFetch({ list: [albumA(), albumB(), albumLegacy()], pins: [] });
    const { status, body } = await statusOf(await listGet({ cookies: {} } as never));
    expect(status).toBe(200);
    const ids = (body.albums as { id: string }[]).map((a) => a.id);
    expect(ids).toEqual(["album-a"]);
  });

  it("vendor list query carries the owner filter with session.ownerId", async () => {
    requireAdminMock.mockResolvedValue(V1);
    routeFetch({ list: [albumA()], pins: [] });
    await listGet({ cookies: {} } as never);
    const calls = sanityFetchMock.mock.calls as unknown as [string, Record<string, unknown>?][];
    const listCall = calls.find(([q]) => q.includes('_type == "album"') && !q.includes("pin"));
    expect(listCall).toBeDefined();
    expect(listCall![0]).toContain("owner._ref == $ownerId");
    expect(listCall![1]).toMatchObject({ ownerId: "admin.v1" });
  });

  it("superadmin sees all albums including ownerless legacy", async () => {
    requireAdminMock.mockResolvedValue(SUPER);
    routeFetch({ list: [albumA(), albumB(), albumLegacy()], pins: [] });
    const { status, body } = await statusOf(await listGet({ cookies: {} } as never));
    expect(status).toBe(200);
    const ids = (body.albums as { id: string }[]).map((a) => a.id).sort();
    expect(ids).toEqual(["album-a", "album-b", "album-legacy"]);
  });
});

// --- POST /api/admin/albums ---------------------------------------------------

describe("POST /api/admin/albums owner forcing", () => {
  const validBody = {
    title: "Wedding",
    clientName: "Client",
    pin: "1234",
    maxSelections: 5,
    vendorName: "Vendor Satu",
    storageType: "sanity",
  };
  const driveBody = {
    ...validBody,
    storageType: "drive",
    driveFolderId: "AbC123XyZ9",
    photos: [{ id: "AbC123XyZ9", name: "DSC_0001.JPG", resourceKey: null }],
  };

  it("ignores client-sent owner and forces session.ownerId", async () => {
    requireAdminMock.mockResolvedValue(V1);
    const { status } = await statusOf(
      await listPost({ cookies: {}, request: jsonRequest({ ...driveBody, owner: "admin.palsu" }) } as never)
    );
    expect(status).toBe(201);
    expect(sanityCreateMock).toHaveBeenCalledOnce();
    const doc = sanityCreateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(doc.owner).toEqual({ _type: "reference", _ref: "admin.v1" });
    expect(JSON.stringify(doc)).not.toContain("admin.palsu");
  });

  it("rejects vendor sanity-storage creates with 400 (vendors are Drive-only)", async () => {
    requireAdminMock.mockResolvedValue(V1);
    const { status, body } = await statusOf(
      await listPost({ cookies: {}, request: jsonRequest(validBody) } as never)
    );
    expect(status).toBe(400);
    expect(body.error).toBe("Vendor albums must use Google Drive storage");
    expect(sanityCreateMock).not.toHaveBeenCalled();
  });

  it("lets superadmins create sanity-storage albums", async () => {
    requireAdminMock.mockResolvedValue(SUPER);
    const { status } = await statusOf(
      await listPost({ cookies: {}, request: jsonRequest(validBody) } as never)
    );
    expect(status).toBe(201);
  });
});

// --- GET /api/admin/albums/[id] ------------------------------------------------

describe("GET /api/admin/albums/[id] tenant guard", () => {
  it("vendor cross-read is 404, not 403 (anti-enumeration)", async () => {
    requireAdminMock.mockResolvedValue(V1);
    routeFetch({ single: albumB() });
    const { status, body } = await statusOf(
      await detailGet({ params: { id: "album-b" }, cookies: {} } as never)
    );
    expect(status).toBe(404);
    expect(body.error).toBe("Album not found");
  });

  it("vendor reads own album", async () => {
    requireAdminMock.mockResolvedValue(V1);
    routeFetch({ single: albumA() });
    const { status } = await statusOf(
      await detailGet({ params: { id: "album-a" }, cookies: {} } as never)
    );
    expect(status).toBe(200);
  });

  it("superadmin reads ownerless legacy album", async () => {
    requireAdminMock.mockResolvedValue(SUPER);
    routeFetch({ single: albumLegacy() });
    const { status } = await statusOf(
      await detailGet({ params: { id: "album-legacy" }, cookies: {} } as never)
    );
    expect(status).toBe(200);
  });

  it("vendor cannot read ownerless legacy album (404)", async () => {
    requireAdminMock.mockResolvedValue(V1);
    routeFetch({ single: albumLegacy() });
    const { status } = await statusOf(
      await detailGet({ params: { id: "album-legacy" }, cookies: {} } as never)
    );
    expect(status).toBe(404);
  });
});

// --- PUT / DELETE /api/admin/albums/[id] ---------------------------------------

describe("PUT /api/admin/albums/[id] tenant guard", () => {
  it("vendor cross-update is 404 and never patches", async () => {
    requireAdminMock.mockResolvedValue(V1);
    routeFetch({ single: albumB() });
    const { status } = await statusOf(
      await detailPut({
        params: { id: "album-b" },
        cookies: {},
        request: jsonRequest({ title: "Hijacked" }),
      } as never)
    );
    expect(status).toBe(404);
    expect(sanityPatchMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/albums/[id] tenant guard", () => {
  it("vendor cross-delete is 404 and never cascade-deletes", async () => {
    requireAdminMock.mockResolvedValue(V1);
    routeFetch({ single: albumB() });
    const { status } = await statusOf(
      await detailDelete({ params: { id: "album-b" }, cookies: {} } as never)
    );
    expect(status).toBe(404);
    expect(cascadeDeleteAlbumsMock).not.toHaveBeenCalled();
  });
});

// --- lock / unlock / reset / reorder --------------------------------------------

describe("POST /api/admin/albums/[id]/lock tenant guard", () => {
  it("vendor cross-lock is 404 and never patches", async () => {
    requireAdminMock.mockResolvedValue(V1);
    routeFetch({ single: albumB() });
    const { status } = await statusOf(
      await lockPost({ params: { id: "album-b" }, cookies: {} } as never)
    );
    expect(status).toBe(404);
    expect(sanityPatchMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/albums/[id]/unlock tenant guard", () => {
  it("vendor cross-unlock is 404 and never mutates", async () => {
    requireAdminMock.mockResolvedValue(V1);
    routeFetch({ single: albumB() });
    const { status } = await statusOf(
      await unlockPost({ params: { id: "album-b" }, cookies: {} } as never)
    );
    expect(status).toBe(404);
    expect(sanityMutateMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/albums/[id]/reset tenant guard", () => {
  it("vendor cross-reset is 404 and never mutates", async () => {
    requireAdminMock.mockResolvedValue(V1);
    routeFetch({ single: albumB() });
    const { status } = await statusOf(
      await resetPost({ params: { id: "album-b" }, cookies: {} } as never)
    );
    expect(status).toBe(404);
    expect(sanityMutateMock).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/albums/[id]/reorder tenant guard", () => {
  it("vendor cross-reorder is 404 and never patches", async () => {
    requireAdminMock.mockResolvedValue(V1);
    routeFetch({
      single: { ...albumB(), photos: [{ _ref: "p1" }, { _ref: "p2" }] },
    });
    const { status } = await statusOf(
      await reorderPatch({
        params: { id: "album-b" },
        cookies: {},
        request: jsonRequest({ photoIds: ["p2", "p1"] }),
      } as never)
    );
    expect(status).toBe(404);
    expect(sanityPatchMock).not.toHaveBeenCalled();
  });
});

// --- photos endpoints (guard via parent album owner) ------------------------------

describe("DELETE /api/admin/photos/[id] tenant guard", () => {
  it("vendor deleting a photo from another vendor album is 404", async () => {
    requireAdminMock.mockResolvedValue(V1);
    routeFetch({
      photo: { _id: "p1", album: { _ref: "album-b" } },
      single: albumB(),
    });
    const { status } = await statusOf(
      await photoDelete({ params: { id: "p1" }, cookies: {} } as never)
    );
    expect(status).toBe(404);
    expect(sanityTransactionMock).not.toHaveBeenCalled();
  });

  it("vendor deleting a photo from own album succeeds", async () => {
    requireAdminMock.mockResolvedValue(V1);
    routeFetch({
      photo: { _id: "p1", album: { _ref: "album-a" } },
      single: albumA(),
    });
    const { status } = await statusOf(
      await photoDelete({ params: { id: "p1" }, cookies: {} } as never)
    );
    expect(status).toBe(200);
  });
});

describe("POST /api/admin/photos/bulk-delete tenant guard", () => {
  it("vendor bulk-deleting from another vendor album is 404", async () => {
    requireAdminMock.mockResolvedValue(V1);
    routeFetch({
      single: albumB(),
      photos: [{ _id: "p1", album: { _ref: "album-b" } }],
    });
    const { status } = await statusOf(
      await photosBulkDelete({
        cookies: {},
        request: jsonRequest({ albumId: "album-b", photoIds: ["p1"] }),
      } as never)
    );
    expect(status).toBe(404);
    expect(sanityTransactionMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/albums/bulk-delete tenant guard", () => {
  it("vendor requesting own + foreign ids is 404 and deletes nothing", async () => {
    requireAdminMock.mockResolvedValue(V1);
    routeFetch({ many: [albumA(), albumB()] });
    const { status } = await statusOf(
      await albumsBulkDelete({
        cookies: {},
        request: jsonRequest({ ids: ["album-a", "album-b"] }),
      } as never)
    );
    expect(status).toBe(404);
    expect(cascadeDeleteAlbumsMock).not.toHaveBeenCalled();
  });

  it("vendor deleting only own albums succeeds", async () => {
    requireAdminMock.mockResolvedValue(V1);
    routeFetch({ many: [albumA()] });
    const { status, body } = await statusOf(
      await albumsBulkDelete({
        cookies: {},
        request: jsonRequest({ ids: ["album-a"] }),
      } as never)
    );
    expect(status).toBe(200);
    expect(body.deleted).toBe(1);
  });

  it("superadmin bulk-deletes across owners including legacy", async () => {
    requireAdminMock.mockResolvedValue(SUPER);
    routeFetch({ many: [albumA(), albumB(), albumLegacy()] });
    const { status, body } = await statusOf(
      await albumsBulkDelete({
        cookies: {},
        request: jsonRequest({ ids: ["album-a", "album-b", "album-legacy"] }),
      } as never)
    );
    expect(status).toBe(200);
    expect(body.deleted).toBe(3);
    expect(cascadeDeleteAlbumsMock).toHaveBeenCalledOnce();
  });
});

// Silence unused warnings for fixtures referenced across describes.
void V2;
