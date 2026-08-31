import { beforeEach, describe, expect, it, vi } from "vitest";

import { watchEvents } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({
  consumeRateLimits: vi.fn(),
  getRequestUserId: vi.fn(),
  listWatchEvents: vi.fn(),
  recordWatchEvent: vi.fn(),
  itemRows: [] as Array<Record<string, unknown>>,
  eventRows: [] as Array<Record<string, unknown>>,
  updated: null as Record<string, unknown> | null,
}));

const executor = {
  select: () => ({
    from: (table: unknown) => ({
      where: () => ({
        limit: () => Promise.resolve(table === watchEvents ? mocks.eventRows : mocks.itemRows),
      }),
    }),
  }),
  update: () => ({
    set: (values: Record<string, unknown>) => {
      mocks.updated = values;
      return {
        where: () => ({ returning: () => Promise.resolve([{ id: "item-1", ...values }]) }),
      };
    },
  }),
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-auth", () => ({ getRequestUserId: mocks.getRequestUserId }));
vi.mock("@/lib/api-rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-rate-limit")>("@/lib/api-rate-limit");
  return { ...actual, consumeRateLimits: mocks.consumeRateLimits };
});
vi.mock("@/lib/db/client", () => ({
  db: { transaction: (run: (transaction: typeof executor) => unknown) => run(executor) },
}));
vi.mock("@/lib/watch-events", async () => {
  const actual = await vi.importActual<typeof import("@/lib/watch-events")>("@/lib/watch-events");
  return { ...actual, listWatchEvents: mocks.listWatchEvents, recordWatchEvent: mocks.recordWatchEvent };
});

import { GET, POST } from "./route";

const EVENT_ID = "3f1d2c64-6d6a-4a05-9a2f-6c0f0e6a1b77";

function post(body: unknown) {
  return POST(
    new Request("http://watchlist.test/api/items/item-1/watch-events", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://watchlist.test" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "item-1" }) },
  );
}

function get() {
  return GET(
    new Request("http://watchlist.test/api/items/item-1/watch-events"),
    { params: Promise.resolve({ id: "item-1" }) },
  );
}

describe("/api/items/[id]/watch-events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BETTER_AUTH_URL = "http://watchlist.test";
    mocks.getRequestUserId.mockResolvedValue("account-1");
    mocks.consumeRateLimits.mockResolvedValue({ allowed: true });
    mocks.itemRows = [{ id: "item-1", status: "watched", rating: 8, watchedAt: new Date("2026-01-01T12:00:00.000Z") }];
    mocks.eventRows = [];
    mocks.updated = null;
    mocks.recordWatchEvent.mockResolvedValue({ id: EVENT_ID, watchedOn: "2026-08-31", rating: 8 });
    mocks.listWatchEvents.mockResolvedValue([{ id: EVENT_ID, watchedOn: "2026-08-31", rating: 8 }]);
  });

  it("lists the viewings of one title for its owner", async () => {
    const response = await get();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      events: [{ id: EVENT_ID, watchedOn: "2026-08-31", rating: 8 }],
    });
    expect(mocks.listWatchEvents).toHaveBeenCalledWith("account-1", "item-1");
  });

  it("rejects an unauthenticated read", async () => {
    mocks.getRequestUserId.mockResolvedValue(null);

    expect((await get()).status).toBe(401);
    expect(mocks.listWatchEvents).not.toHaveBeenCalled();
  });

  it("logs another viewing with the rating the title carries now", async () => {
    const response = await post({ eventId: EVENT_ID, watchedOn: "2026-08-31" });

    expect(response.status).toBe(201);
    expect(mocks.recordWatchEvent.mock.calls[0][1]).toMatchObject({
      id: EVENT_ID,
      mediaItemId: "item-1",
      rating: 8,
      userId: "account-1",
      watchedOn: "2026-08-31",
    });
    expect(mocks.updated).toMatchObject({ status: "watched", pinnedAt: null });
    expect(mocks.updated?.watchedAt).toEqual(new Date("2026-08-31T12:00:00.000Z"));
  });

  /* A retry has already been recorded, so it must not move the library on a
     second time or log a duplicate. */
  it("accepts a retry of the same viewing without changing anything", async () => {
    mocks.recordWatchEvent.mockResolvedValue(null);
    mocks.eventRows = [{ id: EVENT_ID, watchedOn: "2026-08-31", rating: 8 }];

    const response = await post({ eventId: EVENT_ID, watchedOn: "2026-08-31" });

    expect(response.status).toBe(201);
    expect(mocks.updated).toBeNull();
  });

  it("refuses an event id that belongs to somebody else", async () => {
    mocks.recordWatchEvent.mockResolvedValue(null);
    mocks.eventRows = [];

    const response = await post({ eventId: EVENT_ID, watchedOn: "2026-08-31" });

    expect(response.status).toBe(409);
    expect(mocks.updated).toBeNull();
  });

  it("does not log a viewing of a removed title", async () => {
    mocks.itemRows = [{ id: "item-1", status: "removed", rating: null, watchedAt: null }];

    expect((await post({ eventId: EVENT_ID, watchedOn: "2026-08-31" })).status).toBe(404);
    expect(mocks.recordWatchEvent).not.toHaveBeenCalled();
  });

  it("rejects a viewing dated in the future", async () => {
    expect((await post({ eventId: EVENT_ID, watchedOn: "2999-01-01" })).status).toBe(400);
    expect(mocks.recordWatchEvent).not.toHaveBeenCalled();
  });

  /* Logging a viewing you forgot about must not rewind the library's idea of
     when you last saw the title. */
  it("keeps the later date as the title's latest watched state", async () => {
    mocks.itemRows = [{ id: "item-1", status: "watched", rating: 8, watchedAt: new Date("2026-08-30T12:00:00.000Z") }];

    await post({ eventId: EVENT_ID, watchedOn: "2020-05-05" });

    expect(mocks.updated?.watchedAt).toEqual(new Date("2026-08-30T12:00:00.000Z"));
  });
});
