import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeRateLimits: vi.fn(),
  getRequestUserId: vi.fn(),
  getUserStreamingServiceIds: vi.fn(),
  listWatchlistExtras: vi.fn(),
  listUserRegions: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-auth", () => ({ getRequestUserId: mocks.getRequestUserId }));
vi.mock("@/lib/api-rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-rate-limit")>("@/lib/api-rate-limit");
  return { ...actual, consumeRateLimits: mocks.consumeRateLimits };
});
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/account-regions", () => ({ listUserRegions: mocks.listUserRegions }));
vi.mock("@/lib/streaming-services", async () => {
  const actual = await vi.importActual<typeof import("@/lib/streaming-services")>("@/lib/streaming-services");
  return { ...actual, getUserStreamingServiceIds: mocks.getUserStreamingServiceIds };
});
vi.mock("@/lib/watchlist-extras", () => ({ listWatchlistExtras: mocks.listWatchlistExtras }));

import { GET } from "./route";

const titles = [
  {
    mediaItemId: "item-1",
    genres: [],
    runtimeMinutes: 136,
    voteAverage: 8.2,
    voteCount: 100,
    releaseDate: "1999-03-31",
    streaming: [],
    availabilityCheckedAt: null,
  },
];

function getRequest() {
  return new Request("http://watchlist.test/api/watchlist-extras");
}

describe("GET /api/watchlist-extras", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listUserRegions.mockResolvedValue(["SE"]);
    mocks.getRequestUserId.mockResolvedValue("account-1");
    mocks.consumeRateLimits.mockResolvedValue({ allowed: true });
    mocks.getUserStreamingServiceIds.mockResolvedValue([8]);
    mocks.listWatchlistExtras.mockResolvedValue(titles);
  });

  it("rejects an unauthenticated request before touching the catalog", async () => {
    mocks.getRequestUserId.mockResolvedValue(null);

    const response = await GET(getRequest());

    expect(response.status).toBe(401);
    expect(mocks.listWatchlistExtras).not.toHaveBeenCalled();
  });

  it("returns 429 when the account is rate limited", async () => {
    mocks.consumeRateLimits.mockResolvedValue({ allowed: false, reason: "account_read", retryAfter: 5 });

    const response = await GET(getRequest());

    expect(response.status).toBe(429);
    expect(mocks.listWatchlistExtras).not.toHaveBeenCalled();
  });

  it("returns the catalog layer and the current selections", async () => {
    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      regions: ["SE"],
      selectedProviderIds: [8],
      titles,
    });
    expect(mocks.listWatchlistExtras).toHaveBeenCalledWith("account-1", ["SE"]);
  });

  it("returns an empty setup state before a country is saved", async () => {
    mocks.listUserRegions.mockResolvedValue([]);
    mocks.getUserStreamingServiceIds.mockResolvedValue([]);

    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      regions: [],
      selectedProviderIds: [],
      titles,
    });
  });
});
