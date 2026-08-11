import { beforeEach, describe, expect, it } from "vitest";

import {
  clearLibraryCache,
  getCachedLibrary,
  isLibraryCacheFresh,
  LIBRARY_CACHE_TTL_MS,
  type MediaItem,
  removeCachedLibraryItem,
  setCachedLibrary,
  upsertCachedLibraryItem,
} from "@/lib/library-cache";

function item(id: string, status: MediaItem["status"]): MediaItem {
  return {
    id,
    provider: "tmdb",
    externalId: 1,
    mediaType: "movie",
    title: id,
    originalTitle: null,
    releaseYear: 2026,
    posterPath: null,
    overview: null,
    status,
    watchlistNote: null,
    reviewNote: null,
    rating: null,
    addedAt: "2026-01-01T00:00:00.000Z",
    watchedAt: null,
  };
}

describe("library cache", () => {
  beforeEach(() => clearLibraryCache());

  it("keeps different users isolated", () => {
    setCachedLibrary("user-a", "watchlist", [item("a", "watchlist")]);
    setCachedLibrary("user-b", "watchlist", [item("b", "watchlist")]);

    expect(getCachedLibrary("user-a", "watchlist")?.[0].id).toBe("a");
    expect(getCachedLibrary("user-b", "watchlist")?.[0].id).toBe("b");
  });

  it("moves an updated item between populated tab caches", () => {
    const waiting = item("movie", "watchlist");
    setCachedLibrary("user", "watchlist", [waiting]);
    setCachedLibrary("user", "watched", []);

    upsertCachedLibraryItem("user", { ...waiting, status: "watched", watchedAt: "2026-01-02T00:00:00.000Z" });

    expect(getCachedLibrary("user", "watchlist")).toEqual([]);
    expect(getCachedLibrary("user", "watched")?.map((entry) => entry.id)).toEqual(["movie"]);
  });

  it("removes items and expires old entries", () => {
    setCachedLibrary("user", "watchlist", [item("movie", "watchlist")], 1_000);
    expect(isLibraryCacheFresh("user", "watchlist", 1_000 + LIBRARY_CACHE_TTL_MS + 1)).toBe(false);

    removeCachedLibraryItem("user", "movie");

    expect(getCachedLibrary("user", "watchlist")).toEqual([]);
  });
});
