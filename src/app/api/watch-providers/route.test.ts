import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cacheWatchProviders: vi.fn(),
  cacheCatalogAvailability: vi.fn(),
  consumeRateLimits: vi.fn(),
  getCatalogWatchProviders: vi.fn(),
  getCachedWatchProviders: vi.fn(),
  getRequestUserId: vi.fn(),
  logOperationalEvent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-auth", () => ({ getRequestUserId: mocks.getRequestUserId }));
vi.mock("@/lib/api-rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-rate-limit")>("@/lib/api-rate-limit");
  return { ...actual, consumeRateLimits: mocks.consumeRateLimits };
});
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/catalog", () => ({
  cacheCatalogAvailability: mocks.cacheCatalogAvailability,
  getCatalogWatchProviders: mocks.getCatalogWatchProviders,
}));
vi.mock("@/lib/operational-events", () => ({ logOperationalEvent: mocks.logOperationalEvent }));
vi.mock("@/lib/watch-providers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/watch-providers")>("@/lib/watch-providers");
  return {
    ...actual,
    cacheWatchProviders: mocks.cacheWatchProviders,
    getCachedWatchProviders: mocks.getCachedWatchProviders,
  };
});

import { GET } from "./route";

function request(query = "mediaType=movie&tmdbId=603&region=AR") {
  return new Request(`http://watchlist.test/api/watch-providers?${query}`);
}

describe("GET /api/watch-providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TMDB_ACCESS_TOKEN = "test-token";
    mocks.getRequestUserId.mockResolvedValue("account-1");
    mocks.consumeRateLimits.mockResolvedValue({ allowed: true });
    mocks.getCachedWatchProviders.mockResolvedValue(null);
    mocks.getCatalogWatchProviders.mockResolvedValue(null);
    mocks.cacheWatchProviders.mockResolvedValue(undefined);
    mocks.cacheCatalogAvailability.mockResolvedValue(true);
    vi.stubGlobal("fetch", vi.fn());
  });

  it("rejects an unauthenticated request before touching TMDB", async () => {
    mocks.getRequestUserId.mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["a media type TMDB has no provider data for", "mediaType=person&tmdbId=603&region=AR"],
    ["a non-integer title id", "mediaType=movie&tmdbId=abc&region=AR"],
    ["a lowercase region", "mediaType=movie&tmdbId=603&region=ar"],
    ["a missing region", "mediaType=movie&tmdbId=603"],
  ])("rejects %s", async (_label, query) => {
    const response = await GET(request(query));

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("serves a shared cache hit without consuming application TMDB capacity", async () => {
    mocks.getCatalogWatchProviders.mockResolvedValue({
      region: "AR", link: null, streaming: [], rentOrBuy: [],
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.consumeRateLimits).toHaveBeenCalledTimes(1);
    expect(mocks.getCachedWatchProviders).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.logOperationalEvent).toHaveBeenCalledWith(
      "tmdb_watch_providers_completed",
      expect.objectContaining({ cacheHit: true, status: 200 }),
    );
  });

  it("propagates an upstream TMDB 429 and Retry-After", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, {
      status: 429,
      headers: { "Retry-After": "6" },
    }));

    const response = await GET(request());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("6");
    await expect(response.json()).resolves.toMatchObject({
      code: "RATE_LIMITED",
      reason: "tmdb_upstream",
      retryAfter: 6,
    });
  });

  it("turns an upstream failure into a 502", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));

    const response = await GET(request());

    expect(response.status).toBe(502);
    expect(mocks.cacheWatchProviders).not.toHaveBeenCalled();
  });

  it("caches the region's normalized availability without logging identifiers", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({
      id: 603,
      results: {
        AR: { link: "https://tmdb.test/603", flatrate: [{ provider_id: 8, provider_name: "Netflix" }] },
        US: { flatrate: [{ provider_id: 337, provider_name: "Disney Plus" }] },
      },
    }));

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      providers: { region: "AR", streaming: [{ id: 8, name: "Netflix" }] },
    });
    expect(mocks.cacheWatchProviders).toHaveBeenCalledWith(
      "movie",
      603,
      "AR",
      expect.objectContaining({ region: "AR" }),
    );
    expect(mocks.cacheCatalogAvailability).toHaveBeenCalledWith(
      "movie",
      603,
      expect.objectContaining({ results: expect.any(Object) }),
    );

    const serializedEvents = JSON.stringify(mocks.logOperationalEvent.mock.calls);
    expect(serializedEvents).not.toContain("603");
    expect(serializedEvents).not.toContain("AR");
  });
});
