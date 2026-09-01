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

    const response = await GET(getRequest("?year=2026&month=9"));

    expect(response.status).toBe(401);
    expect(mocks.listInsightsEvents).not.toHaveBeenCalled();
  });

  it("returns 429 when the account is rate limited", async () => {
    mocks.consumeRateLimits.mockResolvedValue({ allowed: false, reason: "account_read", retryAfter: 5 });

    const response = await GET(getRequest("?year=2026&month=9"));

    expect(response.status).toBe(429);
    expect(mocks.listInsightsEvents).not.toHaveBeenCalled();
  });

  it("returns a summary for a valid year and month", async () => {
    const response = await GET(getRequest("?year=2026&month=9"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");

    const body = await response.json();
    expect(body.year).toBe(2026);
    expect(body.month).toBe(9);
    expect(body.monthlyBuckets).toHaveLength(12);
  });

  it.each([
    ["a non-numeric year", "?year=abc&month=9"],
    ["an out-of-range month", "?year=2026&month=13"],
  ])("returns 400 for %s", async (_label, query) => {
    const response = await GET(getRequest(query));

    expect(response.status).toBe(400);
  });

  it("falls back to the server's current UTC year and month with no query parameters", async () => {
    const response = await GET(getRequest());

    expect(response.status).toBe(200);

    const now = new Date();
    const body = await response.json();
    expect(body.year).toBe(now.getUTCFullYear());
    expect(body.month).toBe(now.getUTCMonth() + 1);
  });
});
