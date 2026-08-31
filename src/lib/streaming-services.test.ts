import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: {} }));

import { mapTmdbProviderDirectory } from "./streaming-services";

describe("mapTmdbProviderDirectory", () => {
  it("unifies providers while preserving regional priorities by media type", () => {
    const result = mapTmdbProviderDirectory({
      movie: {
        results: [{
          provider_id: 8,
          provider_name: " Netflix ",
          logo_path: "/netflix.jpg",
          display_priorities: { SE: 2, US: 5 },
        }],
      },
      tv: {
        results: [
          {
            provider_id: 8,
            provider_name: "Netflix",
            logo_path: "/netflix.jpg",
            display_priorities: { SE: 1 },
          },
          {
            provider_id: 337,
            provider_name: "Disney Plus",
            display_priorities: { SE: 3, invalid: 4 },
          },
        ],
      },
    });

    expect(result.providers).toEqual([
      { id: 337, name: "Disney Plus", logoPath: null },
      { id: 8, name: "Netflix", logoPath: "/netflix.jpg" },
    ]);
    expect(result.regions).toEqual([
      { providerId: 8, region: "SE", mediaType: "tv", displayPriority: 1 },
      { providerId: 8, region: "SE", mediaType: "movie", displayPriority: 2 },
      { providerId: 337, region: "SE", mediaType: "tv", displayPriority: 3 },
      { providerId: 8, region: "US", mediaType: "movie", displayPriority: 5 },
    ]);
  });

  it("drops providers without a usable identity, name, or region", () => {
    expect(mapTmdbProviderDirectory({
      movie: { results: [{ provider_name: "Missing id" }, { provider_id: 4, provider_name: " " }] },
      tv: { results: [] },
    })).toEqual({ providers: [], regions: [] });
  });
});
