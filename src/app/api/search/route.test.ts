import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cacheTmdbSearch: vi.fn(),
  consumeRateLimits: vi.fn(),
  getCachedTmdbSearch: vi.fn(),
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
vi.mock("@/lib/operational-events", () => ({ logOperationalEvent: mocks.logOperationalEvent }));
vi.mock("@/lib/tmdb-search", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tmdb-search")>("@/lib/tmdb-search");
  return {
    ...actual,
    cacheTmdbSearch: mocks.cacheTmdbSearch,
    getCachedTmdbSearch: mocks.getCachedTmdbSearch,
  };
});

import { API_RATE_LIMITS } from "@/lib/api-rate-limit";

import { GET } from "./route";

function request(query = "?q=Arrival") {
  return new Request(`http://watchlist.test/api/search${query}`);
}

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TMDB_ACCESS_TOKEN = "test-token";
    mocks.getRequestUserId.mockResolvedValue("account-1");
    mocks.consumeRateLimits.mockResolvedValue({ allowed: true });
    mocks.getCachedTmdbSearch.mockResolvedValue(null);
    mocks.cacheTmdbSearch.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn());
  });

  it("serves a shared cache hit without consuming application TMDB capacity", async () => {
    mocks.getCachedTmdbSearch.mockResolvedValue([{ provider: "tmdb", externalId: 1 }]);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.consumeRateLimits).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.logOperationalEvent).toHaveBeenCalledWith("tmdb_search_completed", expect.objectContaining({
      cacheHit: true,
      status: 200,
    }));
  });

  it("returns the machine-readable application limit before calling TMDB", async () => {
    mocks.consumeRateLimits
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false, reason: "tmdb_application", retryAfter: 1 });

    const response = await GET(request());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("1");
    await expect(response.json()).resolves.toMatchObject({
      code: "RATE_LIMITED",
      reason: "tmdb_application",
      retryAfter: 1,
    });
    expect(fetch).not.toHaveBeenCalled();
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
    expect(mocks.logOperationalEvent).toHaveBeenCalledWith("tmdb_upstream_limited", expect.objectContaining({
      retryAfter: 6,
      status: 429,
    }));
  });

  it("caches successful normalized results without logging request text", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({
      results: [{ id: 1, media_type: "movie", title: "Arrival", release_date: "2016-11-11" }],
    }));

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.cacheTmdbSearch).toHaveBeenCalledWith("Arrival", [expect.objectContaining({
      externalId: 1,
      title: "Arrival",
    })]);
    const serializedEvents = JSON.stringify(mocks.logOperationalEvent.mock.calls);
    expect(serializedEvents).not.toContain("Arrival");
  });

  it("charges the interactive account tier when no scope is given", async () => {
    mocks.getCachedTmdbSearch.mockResolvedValue([]);

    await GET(request());

    expect(mocks.consumeRateLimits).toHaveBeenCalledWith("account-1", API_RATE_LIMITS.tmdbAccount);
  });

  it("charges the bulk import tier for scope=bulk", async () => {
    mocks.getCachedTmdbSearch.mockResolvedValue([]);

    await GET(request("?q=Arrival&scope=bulk"));

    expect(mocks.consumeRateLimits).toHaveBeenCalledWith("account-1", API_RATE_LIMITS.tmdbBulkImport);
  });

  it("falls back to the interactive tier for an unrecognized scope", async () => {
    mocks.getCachedTmdbSearch.mockResolvedValue([]);

    await GET(request("?q=Arrival&scope=nonsense"));

    expect(mocks.consumeRateLimits).toHaveBeenCalledWith("account-1", API_RATE_LIMITS.tmdbAccount);
  });
});
