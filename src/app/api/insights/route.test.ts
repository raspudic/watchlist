import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InsightsEvent } from "@/lib/insights";

const mocks = vi.hoisted(() => ({
  consumeRateLimits: vi.fn(),
  getRequestUserId: vi.fn(),
  listInsightsEvents: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-auth", () => ({ getRequestUserId: mocks.getRequestUserId }));
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/api-rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-rate-limit")>("@/lib/api-rate-limit");
  return { ...actual, consumeRateLimits: mocks.consumeRateLimits };
});
vi.mock("@/lib/insights-data", () => ({ listInsightsEvents: mocks.listInsightsEvents }));

import { GET } from "./route";

const events: InsightsEvent[] = [
  {
    id: "event-1",
    mediaItemId: "item-1",
    watchedOn: "2026-09-05",
    rating: 8,
    title: "The Matrix",
    mediaType: "movie",
    posterPath: null,
    runtimeMinutes: 136,
    genres: ["Action"],
  },
];

function getRequest(query = "") {
  return new Request(`http://watchlist.test/api/insights${query}`);
}

describe("GET /api/insights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestUserId.mockResolvedValue("account-1");
    mocks.consumeRateLimits.mockResolvedValue({ allowed: true });
    mocks.listInsightsEvents.mockResolvedValue(events);
  });

  it("rejects an unauthenticated request before touching insights events", async () => {
    mocks.getRequestUserId.mockResolvedValue(null);

    const response = await GET(getRequest("?year=2026&today=2026-09-14&period=year"));

    expect(response.status).toBe(401);
    expect(mocks.listInsightsEvents).not.toHaveBeenCalled();
  });

  it("returns 429 when the account is rate limited", async () => {
    mocks.consumeRateLimits.mockResolvedValue({ allowed: false, reason: "account_read", retryAfter: 5 });

    const response = await GET(getRequest("?year=2026&today=2026-09-14&period=year"));

    expect(response.status).toBe(429);
    expect(mocks.listInsightsEvents).not.toHaveBeenCalled();
  });

  it("returns a summary for a valid year and period", async () => {
    const response = await GET(getRequest("?year=2026&today=2026-09-14&period=year"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");

    const body = await response.json();
    expect(body.year).toBe(2026);
    expect(body.period).toBe("year");
    expect(body.monthlyBuckets).toHaveLength(12);
  });

  it("narrows the summary to the reader's own week", async () => {
    const response = await GET(getRequest("?year=2026&today=2026-09-14&period=week"));

    const body = await response.json();
    expect(body.period).toBe("week");
    expect({ start: body.periodStart, end: body.periodEnd })
      .toEqual({ start: "2026-09-14", end: "2026-09-20" });
    /* The one event is in September but not that week. */
    expect(body.watches).toBe(0);
    /* The year underneath it is unmoved. */
    expect(body.yearWatches).toBe(1);
  });

  /* A week of a year that has already ended has no answer. */
  it("reads a past year as a whole year whatever period is asked for", async () => {
    const response = await GET(getRequest("?year=2025&today=2026-09-14&period=week"));

    const body = await response.json();
    expect(body.period).toBe("year");
    expect({ start: body.periodStart, end: body.periodEnd })
      .toEqual({ start: "2025-01-01", end: "2025-12-31" });
  });

  it.each([
    ["a non-numeric year", "?year=abc&today=2026-09-14&period=year"],
    ["a malformed today", "?year=2026&today=14-09-2026&period=year"],
    ["an unknown period", "?year=2026&today=2026-09-14&period=fortnight"],
  ])("returns 400 for %s", async (_label, query) => {
    const response = await GET(getRequest(query));

    expect(response.status).toBe(400);
  });

  it("falls back to the server's current UTC date and the whole year", async () => {
    const response = await GET(getRequest());

    expect(response.status).toBe(200);

    const now = new Date();
    const body = await response.json();
    expect(body.year).toBe(now.getUTCFullYear());
    expect(body.period).toBe("year");
  });
});
