import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cacheExternalIds: vi.fn(),
  consumeRateLimits: vi.fn(),
  getCachedExternalIds: vi.fn(),
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
vi.mock("@/lib/external-ids", async () => {
  const actual = await vi.importActual<typeof import("@/lib/external-ids")>("@/lib/external-ids");
  return {
    ...actual,
    cacheExternalIds: mocks.cacheExternalIds,
    getCachedExternalIds: mocks.getCachedExternalIds,
  };
});

import { GET } from "./route";

function request(query = "mediaType=movie&tmdbId=603") {
  return new Request(`http://watchlist.test/api/external-ids?${query}`);
}

describe("GET /api/external-ids", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TMDB_ACCESS_TOKEN = "test-token";
    mocks.getRequestUserId.mockResolvedValue("account-1");
    mocks.consumeRateLimits.mockResolvedValue({ allowed: true });
    mocks.getCachedExternalIds.mockResolvedValue(null);
    mocks.cacheExternalIds.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn());
  });

  it("rejects an unauthenticated request before touching TMDB", async () => {
    mocks.getRequestUserId.mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["a media type with no external ids to fetch", "mediaType=person&tmdbId=603"],
    ["a non-integer title id", "mediaType=movie&tmdbId=abc"],
    ["a missing title id", "mediaType=movie"],
  ])("rejects %s", async (_label, query) => {
    const response = await GET(request(query));

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("serves a shared cache hit without consuming application TMDB capacity", async () => {
    mocks.getCachedExternalIds.mockResolvedValue({ imdbId: "tt0133093" });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.consumeRateLimits).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.logOperationalEvent).toHaveBeenCalledWith(
      "tmdb_external_ids_completed",
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
    expect(mocks.cacheExternalIds).not.toHaveBeenCalled();
  });

  /* A title TMDB has no IMDb id for is a successful answer, not a failure: it
     caches like any other so the miss is not re-asked on every sheet open. */
  it("caches a known id and a missing one alike, without logging identifiers", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ id: 603, imdb_id: "tt0133093" }));

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ externalIds: { imdbId: "tt0133093" } });
    expect(mocks.cacheExternalIds).toHaveBeenCalledWith("movie", 603, { imdbId: "tt0133093" });

    vi.mocked(fetch).mockResolvedValue(Response.json({ id: 603, imdb_id: null }));
    await GET(request());
    expect(mocks.cacheExternalIds).toHaveBeenLastCalledWith("movie", 603, { imdbId: null });

    const serializedEvents = JSON.stringify(mocks.logOperationalEvent.mock.calls);
    expect(serializedEvents).not.toContain("603");
    expect(serializedEvents).not.toContain("tt0133093");
  });
});
