import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeRateLimits: vi.fn(),
  getRequestUserId: vi.fn(),
  listUserRegions: vi.fn(),
  replaceUserRegions: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-auth", () => ({ getRequestUserId: mocks.getRequestUserId }));
vi.mock("@/lib/api-rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-rate-limit")>("@/lib/api-rate-limit");
  return { ...actual, consumeRateLimits: mocks.consumeRateLimits };
});
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/account-regions", () => ({
  listUserRegions: mocks.listUserRegions,
  replaceUserRegions: mocks.replaceUserRegions,
}));

import { GET, PUT } from "./route";

function getRequest() {
  return new Request("http://watchlist.test/api/regions");
}

function putRequest(body: unknown) {
  return new Request("http://watchlist.test/api/regions", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Origin: "http://watchlist.test" },
    body: JSON.stringify(body),
  });
}

describe("/api/regions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BETTER_AUTH_URL = "http://watchlist.test";
    mocks.getRequestUserId.mockResolvedValue("account-1");
    mocks.consumeRateLimits.mockResolvedValue({ allowed: true });
    mocks.listUserRegions.mockResolvedValue(["SE", "AR"]);
    mocks.replaceUserRegions.mockImplementation((_userId: string, regions: string[]) => regions);
  });

  it("requires authentication", async () => {
    mocks.getRequestUserId.mockResolvedValue(null);

    expect((await GET(getRequest())).status).toBe(401);
    expect((await PUT(putRequest({ regions: ["SE"] }))).status).toBe(401);
    expect(mocks.replaceUserRegions).not.toHaveBeenCalled();
  });

  it("returns the saved countries, home first", async () => {
    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ regions: ["SE", "AR"] });
  });

  it("saves the whole list in the order it was given", async () => {
    const response = await PUT(putRequest({ regions: ["ar", "SE"] }));

    expect(response.status).toBe(200);
    expect(mocks.replaceUserRegions).toHaveBeenCalledWith("account-1", ["AR", "SE"]);
    await expect(response.json()).resolves.toEqual({ regions: ["AR", "SE"] });
  });

  it("accepts an empty list, which is how the last country is removed", async () => {
    const response = await PUT(putRequest({ regions: [] }));

    expect(response.status).toBe(200);
    expect(mocks.replaceUserRegions).toHaveBeenCalledWith("account-1", []);
  });

  it.each([
    ["a fourth country", { regions: ["SE", "AR", "US", "GB"] }],
    ["a country name", { regions: ["Sweden"] }],
    ["something that is not a list", { regions: "SE" }],
    ["nothing at all", {}],
  ])("rejects %s", async (_label, body) => {
    const response = await PUT(putRequest(body));

    expect(response.status).toBe(400);
    expect(mocks.replaceUserRegions).not.toHaveBeenCalled();
  });

  it("refuses a cross-site write", async () => {
    const response = await PUT(new Request("http://watchlist.test/api/regions", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: "http://elsewhere.test" },
      body: JSON.stringify({ regions: ["SE"] }),
    }));

    expect(response.status).toBe(403);
    expect(mocks.replaceUserRegions).not.toHaveBeenCalled();
  });
});
