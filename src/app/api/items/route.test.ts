import { beforeEach, describe, expect, it, vi } from "vitest";

type ExistingItem = {
  id: string;
  status: string;
  watchlistNote: string | null;
};

const mocks = vi.hoisted(() => ({
  consumeRateLimits: vi.fn(),
  getRequestUserId: vi.fn(),
  existing: [] as ExistingItem[],
  updated: null as Record<string, unknown> | null,
  inserted: null as Record<string, unknown> | null,
  /* Every table the handler deletes from, so a test can prove which. */
  deletes: [] as unknown[],
}));

function updateBuilder() {
  return {
    set: (values: Record<string, unknown>) => {
      mocks.updated = values;
      return {
        where: () => ({
          returning: () => Promise.resolve([{ id: "item-1", userId: "account-1", ...values }]),
        }),
      };
    },
  };
}

const executor = {
  delete: (table: unknown) => {
    mocks.deletes.push(table);
    return { where: () => Promise.resolve([]) };
  },
  update: updateBuilder,
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-auth", () => ({ getRequestUserId: mocks.getRequestUserId }));
vi.mock("@/lib/api-rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-rate-limit")>("@/lib/api-rate-limit");
  return { ...actual, consumeRateLimits: mocks.consumeRateLimits };
});
vi.mock("@/lib/db/client", () => ({
  db: {
    transaction: (run: (transaction: typeof executor) => unknown) => run(executor),
    select: () => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(mocks.existing) }) }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        mocks.inserted = values;
        return { returning: () => Promise.resolve([{ ...values }]) };
      },
    }),
  },
}));

import { watchEvents } from "@/lib/db/schema";

import { POST } from "./route";

function add(body: Record<string, unknown> = {}) {
  return POST(new Request("http://watchlist.test/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://watchlist.test" },
    body: JSON.stringify({
      provider: "tmdb",
      externalId: 603,
      mediaType: "movie",
      title: "The Matrix",
      ...body,
    }),
  }));
}

describe("POST /api/items", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BETTER_AUTH_URL = "http://watchlist.test";
    mocks.getRequestUserId.mockResolvedValue("account-1");
    mocks.consumeRateLimits.mockResolvedValue({ allowed: true });
    mocks.existing = [];
    mocks.updated = null;
    mocks.inserted = null;
    mocks.deletes = [];
  });

  it("refuses a title that is already in the library", async () => {
    mocks.existing = [{ id: "item-1", status: "watchlist", watchlistNote: null }];

    const response = await add();

    expect(response.status).toBe(409);
    expect(mocks.updated).toBeNull();
  });

  it("inserts a title the library has never held", async () => {
    const response = await add();

    expect(response.status).toBe(201);
    expect(mocks.inserted).toMatchObject({ title: "The Matrix", externalId: 603 });
    expect(mocks.deletes).toEqual([]);
  });

  describe("re-adding a removed title", () => {
    beforeEach(() => {
      mocks.existing = [{ id: "item-1", status: "removed", watchlistNote: "From before" }];
    });

    /* The row forgets it was ever watched, so its viewings have to go with it
       — otherwise a deleted title's history walks back into insights the
       moment it is added again. */
    it("throws away the viewing history behind it", async () => {
      const response = await add();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.readded).toBe(true);
      expect(mocks.deletes).toEqual([watchEvents]);
      expect(mocks.updated).toMatchObject({ status: "watchlist", watchedAt: null, rating: null });
    });

    it("clears what the reader had written about the previous save", async () => {
      await add();

      expect(mocks.updated).toMatchObject({
        watchlistNote: null,
        reviewNote: null,
        rating: null,
        pinnedAt: null,
      });
      expect(mocks.updated?.addedAt).toBeInstanceOf(Date);
    });

    it("keeps a note that came with the new save", async () => {
      await add({ watchlistNote: "Try again" });

      expect(mocks.updated).toMatchObject({ watchlistNote: "Try again" });
    });
  });
});
