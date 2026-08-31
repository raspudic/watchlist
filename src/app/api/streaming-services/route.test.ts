import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeRateLimits: vi.fn(),
  getRequestUserId: vi.fn(),
  getUserStreamingServiceIds: vi.fn(),
  listStreamingServicesForRegion: vi.fn(),
  refreshStreamingProviderDirectory: vi.fn(),
  replaceUserStreamingServices: vi.fn(),
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
  return {
    ...actual,
    getUserStreamingServiceIds: mocks.getUserStreamingServiceIds,
    listStreamingServicesForRegion: mocks.listStreamingServicesForRegion,
    refreshStreamingProviderDirectory: mocks.refreshStreamingProviderDirectory,
    replaceUserStreamingServices: mocks.replaceUserStreamingServices,
  };
});

import { GET, PUT } from "./route";

const providers = [
  { id: 8, name: "Netflix", logoPath: "/netflix.jpg", mediaTypes: ["movie", "tv"] },
];

function getRequest() {
  return new Request("http://watchlist.test/api/streaming-services");
}

function putRequest(body: unknown) {
  return new Request("http://watchlist.test/api/streaming-services", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Origin: "http://watchlist.test" },
    body: JSON.stringify(body),
  });
}

describe("/api/streaming-services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BETTER_AUTH_URL = "http://watchlist.test";
    process.env.TMDB_ACCESS_TOKEN = "test-token";
    mocks.rows.splice(0, mocks.rows.length, { region: "SE" });
    mocks.getRequestUserId.mockResolvedValue("account-1");
    mocks.consumeRateLimits.mockResolvedValue({ allowed: true });
    mocks.listStreamingServicesForRegion.mockResolvedValue(providers);
    mocks.getUserStreamingServiceIds.mockResolvedValue([8]);
    mocks.replaceUserStreamingServices.mockResolvedValue([8]);
    mocks.refreshStreamingProviderDirectory.mockResolvedValue({ providers: 1, regions: 1 });
  });

  it("requires authentication", async () => {
    mocks.getRequestUserId.mockResolvedValue(null);

    expect((await GET(getRequest())).status).toBe(401);
    expect((await PUT(putRequest({ providerIds: [] }))).status).toBe(401);
  });

  it("returns an empty setup state before a country is saved", async () => {
    mocks.rows.splice(0, mocks.rows.length, { region: null });

    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      providers: [], region: null, selectedProviderIds: [],
    });
    expect(mocks.listStreamingServicesForRegion).not.toHaveBeenCalled();
  });

  it("returns the regional directory and current selections", async () => {
    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      providers,
      region: "SE",
      selectedProviderIds: [8],
    });
  });

  it("refreshes a cold provider directory once", async () => {
    mocks.listStreamingServicesForRegion
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(providers);

    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    expect(mocks.refreshStreamingProviderDirectory).toHaveBeenCalledTimes(1);
    expect(mocks.consumeRateLimits).toHaveBeenCalledTimes(3);
  });

  it("validates and atomically replaces selections", async () => {
    mocks.replaceUserStreamingServices.mockResolvedValue([8, 337]);

    const response = await PUT(putRequest({ providerIds: [8, 337] }));

    expect(response.status).toBe(200);
    expect(mocks.replaceUserStreamingServices).toHaveBeenCalledWith("account-1", "SE", [8, 337]);
    await expect(response.json()).resolves.toMatchObject({
      region: "SE",
      selectedProviderIds: [8, 337],
    });
  });

  it.each([
    [{ providerIds: [8, 8] }],
    [{ providerIds: [0] }],
    [{ providerIds: "8" }],
  ])("rejects an invalid selection", async (body) => {
    const response = await PUT(putRequest(body));

    expect(response.status).toBe(400);
    expect(mocks.replaceUserStreamingServices).not.toHaveBeenCalled();
  });
});
