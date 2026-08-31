import { beforeEach, describe, expect, it, vi } from "vitest";

type ExistingItem = {
  id: string;
  status: string;
  watchedAt: Date | null;
  rating: number | null;
};

const mocks = vi.hoisted(() => ({
  consumeRateLimits: vi.fn(),
  getRequestUserId: vi.fn(),
  recordWatchEvent: vi.fn(),
  syncLatestWatchEvent: vi.fn(),
  existing: [] as ExistingItem[],
  updated: null as Record<string, unknown> | null,
  /* Set to an empty array to play the request that lost a race. */
  updateResult: null as Array<Record<string, unknown>> | null,
}));

function updateBuilder() {
  return {
    set: (values: Record<string, unknown>) => {
      mocks.updated = values;
      return {
        where: () => ({
          returning: () => Promise.resolve(
            mocks.updateResult
            ?? [{ userId: "account-1", ...mocks.existing[0], ...values }],
          ),
        }),
      };
    },
  };
}

const executor = {
  select: () => ({
    from: () => ({ where: () => ({ limit: () => Promise.resolve(mocks.existing) }) }),
  }),
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
    update: updateBuilder,
  },
}));
vi.mock("@/lib/watch-events", async () => {
  const actual = await vi.importActual<typeof import("@/lib/watch-events")>("@/lib/watch-events");
  return {
    ...actual,
    recordWatchEvent: mocks.recordWatchEvent,
    syncLatestWatchEvent: mocks.syncLatestWatchEvent,
  };
});

import { DELETE, PATCH } from "./route";

function patch(body: unknown) {
  return PATCH(
    new Request("http://watchlist.test/api/items/item-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Origin: "http://watchlist.test" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "item-1" }) },
  );
}

function remove() {
  return DELETE(
    new Request("http://watchlist.test/api/items/item-1", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Origin: "http://watchlist.test" },
    }),
    { params: Promise.resolve({ id: "item-1" }) },
  );
}

describe("PATCH /api/items/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BETTER_AUTH_URL = "http://watchlist.test";
    mocks.getRequestUserId.mockResolvedValue("account-1");
    mocks.consumeRateLimits.mockResolvedValue({ allowed: true });
    mocks.existing = [{ id: "item-1", status: "watchlist", watchedAt: null, rating: null }];
    mocks.updated = null;
    mocks.updateResult = null;
  });

  describe("pins", () => {
    it("stamps a pin on a watchlist title", async () => {
      const response = await patch({ pinned: true });

      expect(response.status).toBe(200);
      expect(mocks.updated?.pinnedAt).toBeInstanceOf(Date);
    });

    it("clears the pin when it is turned off", async () => {
      await patch({ pinned: false });

      expect(mocks.updated?.pinnedAt).toBeNull();
    });

    it("refuses to pin a watched title", async () => {
      mocks.existing = [{ id: "item-1", status: "watched", watchedAt: new Date(), rating: null }];

      const response = await patch({ pinned: true });

      expect(response.status).toBe(409);
      expect(mocks.updated).toBeNull();
    });

    it("refuses to pin a removed title", async () => {
      mocks.existing = [{ id: "item-1", status: "removed", watchedAt: null, rating: null }];

      const response = await patch({ status: "watchlist", pinned: true });

      expect(response.status).toBe(409);
      expect(mocks.updated).toBeNull();
    });

    it("clears the pin when the title is marked watched", async () => {
      await patch({ status: "watched" });

      expect(mocks.updated?.pinnedAt).toBeNull();
    });

    /* Moving a title back deliberately does not restore what it used to hold:
       the pin said "watch this soon", and it has been watched since. */
    it("leaves the pin alone when a watched title moves back", async () => {
      mocks.existing = [{ id: "item-1", status: "watched", watchedAt: new Date(), rating: null }];

      await patch({ status: "watchlist" });

      expect(mocks.updated).not.toHaveProperty("pinnedAt");
    });

    /* Removal is undoable, so the pin has to survive it. */
    it("keeps the pin through a soft removal and its undo", async () => {
      await remove();
      expect(mocks.updated).not.toHaveProperty("pinnedAt");

      mocks.existing = [{ id: "item-1", status: "removed", watchedAt: null, rating: null }];
      await patch({ status: "watchlist" });

      expect(mocks.updated).not.toHaveProperty("pinnedAt");
    });
  });

  describe("watch history", () => {
    it("records one viewing on the day the browser is showing", async () => {
      await patch({ status: "watched", watchedOn: "2026-08-31" });

      expect(mocks.recordWatchEvent).toHaveBeenCalledTimes(1);
      expect(mocks.recordWatchEvent.mock.calls[0][1]).toMatchObject({
        mediaItemId: "item-1",
        userId: "account-1",
        watchedOn: "2026-08-31",
      });
      expect(mocks.syncLatestWatchEvent).not.toHaveBeenCalled();
    });

    it("does not record a second viewing when a watched title is marked watched again", async () => {
      mocks.existing = [{ id: "item-1", status: "watched", watchedAt: new Date(), rating: null }];

      await patch({ status: "watched" });

      expect(mocks.recordWatchEvent).not.toHaveBeenCalled();
    });

    /* Whichever request claims the transition records the viewing; the other
       finds the title already watched and only reports the current state. */
    it("records nothing when a concurrent request already made the transition", async () => {
      mocks.updateResult = [];

      const response = await patch({ status: "watched" });

      expect(response.status).toBe(200);
      expect(mocks.recordWatchEvent).not.toHaveBeenCalled();
    });

    it("revises the viewing on record when the date is edited", async () => {
      mocks.existing = [{ id: "item-1", status: "watched", watchedAt: new Date(), rating: null }];

      await patch({ watchedAt: "2026-08-20T12:00:00.000Z", watchedOn: "2026-08-20" });

      expect(mocks.recordWatchEvent).not.toHaveBeenCalled();
      expect(mocks.syncLatestWatchEvent).toHaveBeenCalledTimes(1);
      expect(mocks.syncLatestWatchEvent.mock.calls[0][2]).toEqual({ watchedOn: "2026-08-20" });
    });

    it("keeps the rating snapshot of the latest viewing in step", async () => {
      mocks.existing = [{ id: "item-1", status: "watched", watchedAt: new Date(), rating: 6 }];

      await patch({ rating: 9 });

      expect(mocks.syncLatestWatchEvent.mock.calls[0][2]).toEqual({ rating: 9 });
    });

    it("clears only the latest snapshot when a rating is removed", async () => {
      mocks.existing = [{ id: "item-1", status: "watched", watchedAt: new Date(), rating: 6 }];

      await patch({ rating: null });

      expect(mocks.syncLatestWatchEvent.mock.calls[0][2]).toEqual({ rating: null });
    });

    it("preserves history when a watched title moves back to the watchlist", async () => {
      mocks.existing = [{ id: "item-1", status: "watched", watchedAt: new Date(), rating: 7 }];

      await patch({ status: "watchlist" });

      expect(mocks.recordWatchEvent).not.toHaveBeenCalled();
      expect(mocks.syncLatestWatchEvent).not.toHaveBeenCalled();
    });

    it("rejects a viewing dated in the future", async () => {
      const response = await patch({ status: "watched", watchedOn: "2999-01-01" });

      expect(response.status).toBe(400);
      expect(mocks.recordWatchEvent).not.toHaveBeenCalled();
    });
  });
});
