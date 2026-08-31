import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeRateLimits: vi.fn(),
  getRequestUserId: vi.fn(),
  getUserStreamingServiceIds: vi.fn(),
  listTonightCandidates: vi.fn(),
  rows: [{ region: "SE" }] as Array<{ region: string | null }>,
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
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(mocks.rows) }),
      }),
    }),
  },
}));
vi.mock("@/lib/streaming-services", async () => {
  const actual = await vi.importActual<typeof import("@/lib/streaming-services")>("@/lib/streaming-services");
  return { ...actual, getUserStreamingServiceIds: mocks.getUserStreamingServiceIds };
});
vi.mock("@/lib/tonight-candidates", () => ({ listTonightCandidates: mocks.listTonightCandidates }));

import { GET } from "./route";

const candidates = [
  {
    item: { id: "item-1", title: "The Matrix" },
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
  return new Request("http://watchlist.test/api/tonight");
}

describe("GET /api/tonight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rows.splice(0, mocks.rows.length, { region: "SE" });
    mocks.getRequestUserId.mockResolvedValue("account-1");
    mocks.consumeRateLimits.mockResolvedValue({ allowed: true });
    mocks.getUserStreamingServiceIds.mockResolvedValue([8]);
    mocks.listTonightCandidates.mockResolvedValue(candidates);
  });

  it("rejects an unauthenticated request before touching candidates", async () => {
    mocks.getRequestUserId.mockResolvedValue(null);

    const response = await GET(getRequest());

    expect(response.status).toBe(401);
    expect(mocks.listTonightCandidates).not.toHaveBeenCalled();
  });

  it("returns 429 when the account is rate limited", async () => {
    mocks.consumeRateLimits.mockResolvedValue({ allowed: false, reason: "account_read", retryAfter: 5 });

    const response = await GET(getRequest());

    expect(response.status).toBe(429);
    expect(mocks.listTonightCandidates).not.toHaveBeenCalled();
  });

  it("returns candidates and selections for a signed-in user with a saved region", async () => {
    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      region: "SE",
      selectedProviderIds: [8],
      candidates,
    });
    expect(mocks.listTonightCandidates).toHaveBeenCalledWith("account-1", "SE");
  });

  it.each([
    ["no saved region", null],
    ["an invalid region", "xx"],
  ])("returns an empty setup state for %s", async (_label, region) => {
    mocks.rows.splice(0, mocks.rows.length, { region });

    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      region: null,
      selectedProviderIds: [],
      candidates,
    });
    expect(mocks.getUserStreamingServiceIds).not.toHaveBeenCalled();
  });
});
