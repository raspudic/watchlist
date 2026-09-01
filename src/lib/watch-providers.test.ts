import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: {} }));

import { mapWatchProviders, mapWatchRegions, watchProviderCacheKey } from "./watch-providers";

const netflix = { provider_id: 8, provider_name: "Netflix", logo_path: "/netflix.jpg", display_priority: 3 };
const prime = { provider_id: 9, provider_name: "Amazon Prime Video", logo_path: "/prime.jpg", display_priority: 1 };
const appleTv = { provider_id: 2, provider_name: "Apple TV", logo_path: "/apple.jpg", display_priority: 5 };

describe("mapWatchProviders", () => {
  it("groups streaming ahead of rent or buy and orders by display priority", () => {
    const result = mapWatchProviders({
      results: {
        AR: { link: "https://www.themoviedb.org/movie/603/watch?locale=AR", flatrate: [netflix, prime], rent: [appleTv] },
      },
    }, "AR");

    expect(result.streaming.map((provider) => provider.name)).toEqual(["Prime Video", "Netflix"]);
    expect(result.rentOrBuy.map((provider) => provider.name)).toEqual(["Apple TV"]);
    expect(result.link).toBe("https://www.themoviedb.org/movie/603/watch?locale=AR");
  });

  it("folds free and ad-supported offers into streaming", () => {
    const result = mapWatchProviders({
      results: { US: { free: [appleTv], ads: [netflix] } },
    }, "US");

    expect(result.streaming.map((provider) => provider.id)).toEqual([8, 2]);
  });

  it("never lists a provider twice when it both streams and rents", () => {
    const result = mapWatchProviders({
      results: { US: { flatrate: [prime], rent: [prime], buy: [prime, appleTv] } },
    }, "US");

    expect(result.streaming.map((provider) => provider.id)).toEqual([9]);
    expect(result.rentOrBuy.map((provider) => provider.id)).toEqual([2]);
  });

  it("folds Prime Video provider aliases into one service", () => {
    const result = mapWatchProviders({
      results: {
        SE: {
          flatrate: [
            { provider_id: 9, provider_name: "Amazon Prime Video", display_priority: 2 },
            { provider_id: 119, provider_name: "Prime Video with Ads", display_priority: 1 },
          ],
          rent: [{ provider_id: 9, provider_name: "Prime Video" }],
        },
      },
    }, "SE");

    expect(result.streaming).toEqual([{
      id: 119,
      name: "Prime Video",
      logoPath: null,
    }]);
    expect(result.rentOrBuy).toEqual([]);
  });

  it("returns an empty result for a region TMDB has no data for", () => {
    const result = mapWatchProviders({ results: { US: { flatrate: [netflix] } } }, "AR");

    expect(result).toEqual({ region: "AR", link: null, streaming: [], rentOrBuy: [] });
  });

  it("drops entries missing an id or a name, and a blank link", () => {
    const result = mapWatchProviders({
      results: {
        US: {
          link: "   ",
          flatrate: [netflix, { provider_name: "No id" }, { provider_id: 40, provider_name: "  " }],
        },
      },
    }, "US");

    expect(result.streaming).toHaveLength(1);
    expect(result.link).toBeNull();
  });
});

describe("mapWatchRegions", () => {
  it("sorts by name and skips entries without a usable code or name", () => {
    const regions = mapWatchRegions({
      results: [
        { iso_3166_1: "US", english_name: "United States of America" },
        { iso_3166_1: "AR", english_name: "Argentina" },
        { iso_3166_1: "XYZ", english_name: "Nowhere" },
        { english_name: "No code" },
        { iso_3166_1: "JP", native_name: "日本" },
      ],
    });

    expect(regions).toEqual([
      { code: "AR", name: "Argentina" },
      { code: "US", name: "United States of America" },
      { code: "JP", name: "日本" },
    ]);
  });
});

describe("watchProviderCacheKey", () => {
  it("separates media type, title and region so regions never share an entry", () => {
    expect(watchProviderCacheKey("movie", 603, "AR")).toBe("movie:603:AR");
    expect(watchProviderCacheKey("tv", 603, "AR")).not.toBe(watchProviderCacheKey("movie", 603, "AR"));
  });
});
