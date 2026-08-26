import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: {} }));

import {
  mapTmdbResults,
  normalizeTmdbQuery,
  parseRetryAfter,
  TMDB_SEARCH_CACHE_TTL_MS,
  tmdbQueryCacheKey,
} from "./tmdb-search";

describe("TMDB search helpers", () => {
  it("normalizes equivalent queries to the same opaque cache key", () => {
    expect(normalizeTmdbQuery("  DUNE\tPart TWO ")).toBe("dune part two");
    expect(tmdbQueryCacheKey("  DUNE\tPart TWO ")).toBe(tmdbQueryCacheKey("dune part two"));
    expect(tmdbQueryCacheKey("dune part two")).not.toContain("dune");
  });

  it("keeps shared search results for one hour", () => {
    expect(TMDB_SEARCH_CACHE_TTL_MS).toBe(60 * 60 * 1000);
  });

  it("maps supported results and excludes people", () => {
    expect(mapTmdbResults([
      {
        id: 1,
        media_type: "movie",
        title: "Arrival",
        original_title: "Arrival",
        release_date: "2016-11-11",
        overview: "  First contact.  ",
        popularity: 12,
        vote_average: 8,
      },
      { id: 2, media_type: "person", name: "Someone" },
      { id: 3, media_type: "tv", name: "Severance", first_air_date: "2022-02-18" },
    ])).toEqual([
      {
        provider: "tmdb",
        externalId: 1,
        mediaType: "movie",
        title: "Arrival",
        originalTitle: "Arrival",
        releaseYear: 2016,
        posterPath: null,
        overview: "First contact.",
        popularity: 12,
        voteAverage: 8,
      },
      {
        provider: "tmdb",
        externalId: 3,
        mediaType: "tv",
        title: "Severance",
        originalTitle: null,
        releaseYear: 2022,
        posterPath: null,
        overview: null,
        popularity: 0,
        voteAverage: null,
      },
    ]);
  });

  it("parses Retry-After seconds and HTTP dates with a safe fallback", () => {
    expect(parseRetryAfter("2.2", 0)).toBe(3);
    expect(parseRetryAfter("Thu, 01 Jan 1970 00:00:05 GMT", 2_000)).toBe(3);
    expect(parseRetryAfter("invalid", 0)).toBe(2);
    expect(parseRetryAfter(null, 0)).toBe(2);
  });
});
