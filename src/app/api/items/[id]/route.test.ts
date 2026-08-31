import { beforeEach, describe, expect, it, vi } from "vitest";

type ExistingItem = { id: string; status: string };

const mocks = vi.hoisted(() => ({
  consumeRateLimits: vi.fn(),
  getRequestUserId: vi.fn(),
  existing: [] as ExistingItem[],
  updated: null as Record<string, unknown> | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-auth", () => ({ getRequestUserId: mocks.getRequestUserId }));
vi.mock("@/lib/api-rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-rate-limit")>("@/lib/api-rate-limit");
  return { ...actual, consumeRateLimits: mocks.consumeRateLimits };
});
vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(mocks.existing) }) }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        mocks.updated = values;
        return {
          where: () => ({
            returning: () => Promise.resolve([{ id: "item-1", ...values }]),
          }),
        };
      },
    }),
  },
}));

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

describe("PATCH /api/items/[id] pins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BETTER_AUTH_URL = "http://watchlist.test";
    mocks.getRequestUserId.mockResolvedValue("account-1");
    mocks.consumeRateLimits.mockResolvedValue({ allowed: true });
    mocks.existing = [{ id: "item-1", status: "watchlist" }];
    mocks.updated = null;
  });

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
    mocks.existing = [{ id: "item-1", status: "watched" }];

    const response = await patch({ pinned: true });

    expect(response.status).toBe(409);
    expect(mocks.updated).toBeNull();
  });

  it("refuses to pin a removed title", async () => {
    mocks.existing = [{ id: "item-1", status: "removed" }];

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
    mocks.existing = [{ id: "item-1", status: "watched" }];

    await patch({ status: "watchlist" });

    expect(mocks.updated).not.toHaveProperty("pinnedAt");
  });

  /* Removal is undoable, so the pin has to survive it. */
  it("keeps the pin through a soft removal and its undo", async () => {
    await DELETE(
      new Request("http://watchlist.test/api/items/item-1", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Origin: "http://watchlist.test" },
      }),
      { params: Promise.resolve({ id: "item-1" }) },
    );
    expect(mocks.updated).not.toHaveProperty("pinnedAt");

    mocks.existing = [{ id: "item-1", status: "removed" }];
    await patch({ status: "watchlist" });

    expect(mocks.updated).not.toHaveProperty("pinnedAt");
  });
});
