import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: {} }));

import {
  catalogTitleId,
  mapTmdbAvailability,
  mapTmdbTitleDetails,
} from "./catalog";

describe("catalogTitleId", () => {
  it("is stable and keeps movie and television identities separate", () => {
    expect(catalogTitleId("movie", 603)).toBe("tmdb:movie:603");
    expect(catalogTitleId("tv", 603)).toBe("tmdb:tv:603");
  });
});

describe("mapTmdbTitleDetails", () => {
  it("maps movie metadata and drops duplicate or malformed genres", () => {
    expect(mapTmdbTitleDetails("movie", {
      id: 603,
      title: "The Matrix",
      original_title: "The Matrix",
      release_date: "1999-03-30",
      runtime: 136,
      genres: [
        { id: 28, name: "Action" },
        { id: 878, name: "Science Fiction" },
        { id: 28, name: "Action" },
        { name: "Missing id" },
      ],
      vote_average: 8.2,
      vote_count: 27_000,
      popularity: 74.5,
    })).toMatchObject({
      id: "tmdb:movie:603",
      releaseDate: "1999-03-30",
      releaseYear: 1999,
      runtimeMinutes: 136,
      voteAverage: 8.2,
      voteCount: 27_000,
      genres: [
        { id: 28, name: "Action" },
        { id: 878, name: "Science Fiction" },
      ],
    });
  });

  it("uses a representative episode runtime and hides unrated scores", () => {
    expect(mapTmdbTitleDetails("tv", {
      id: 1399,
      name: "Game of Thrones",
      first_air_date: "2011-04-17",
      episode_run_time: [50, 60, 55, 0],
      vote_average: 9.9,
      vote_count: 0,
    })).toMatchObject({
      runtimeMinutes: 55,
      voteAverage: null,
      voteCount: 0,
    });
  });

  it("rejects a response without a usable identity and title", () => {
    expect(mapTmdbTitleDetails("movie", { id: 0, title: "Untitled" })).toBeNull();
    expect(mapTmdbTitleDetails("tv", { id: 1, name: "  " })).toBeNull();
  });
});

describe("mapTmdbAvailability", () => {
  it("maps every valid region and lets streaming win over rent or buy", () => {
    const result = mapTmdbAvailability({
      results: {
        SE: {
          link: "https://www.themoviedb.org/movie/603/watch?locale=SE",
          flatrate: [{
            provider_id: 8,
            provider_name: "Netflix",
            logo_path: "/netflix.jpg",
            display_priority: 2,
          }],
          rent: [
            { provider_id: 8, provider_name: "Netflix", display_priority: 2 },
            { provider_id: 2, provider_name: "Apple TV", display_priority: 4 },
          ],
        },
        US: { free: [{ provider_id: 9, provider_name: "Prime Video" }] },
        invalid: { flatrate: [{ provider_id: 20, provider_name: "Ignored" }] },
      },
    });

    expect(result.providers.map((provider) => provider.id)).toEqual([2, 8, 9]);
    expect(result.regions).toEqual([
      {
        region: "SE",
        link: "https://www.themoviedb.org/movie/603/watch?locale=SE",
        services: [
          { providerId: 8, accessType: "streaming", displayPriority: 2 },
          { providerId: 2, accessType: "rent_or_buy", displayPriority: 4 },
        ],
      },
      {
        region: "US",
        link: null,
        services: [{ providerId: 9, accessType: "streaming", displayPriority: 9_999 }],
      },
    ]);
  });

  it("records a known regional result even when it has no offers", () => {
    expect(mapTmdbAvailability({ results: { SE: { link: " " } } }).regions).toEqual([
      { region: "SE", link: null, services: [] },
    ]);
  });
});
