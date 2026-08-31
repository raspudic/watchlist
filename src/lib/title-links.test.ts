import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: {} }));

import { mapExternalIds } from "./external-ids";
import { titleLinks } from "./title-links";

describe("titleLinks", () => {
  it("puts IMDb first when the id is known", () => {
    expect(titleLinks({ imdbId: "tt0133093", mediaType: "movie", tmdbId: 603 })).toEqual([
      { href: "https://www.imdb.com/title/tt0133093/", label: "IMDb" },
      { href: "https://www.themoviedb.org/movie/603", label: "TMDB" },
      { href: "https://letterboxd.com/tmdb/603/", label: "Letterboxd" },
    ]);
  });

  it("leaves IMDb out rather than linking to a search", () => {
    expect(titleLinks({ imdbId: null, mediaType: "movie", tmdbId: 603 })
      .map((link) => link.label)).toEqual(["TMDB", "Letterboxd"]);
  });

  /* Letterboxd reads a TMDB id as a film id, so a series would redirect to
     whichever unrelated film holds that number. */
  it("offers no Letterboxd link for a series", () => {
    expect(titleLinks({ imdbId: "tt0903747", mediaType: "tv", tmdbId: 1396 })).toEqual([
      { href: "https://www.imdb.com/title/tt0903747/", label: "IMDb" },
      { href: "https://www.themoviedb.org/tv/1396", label: "TMDB" },
    ]);
  });
});

describe("mapExternalIds", () => {
  it.each([
    ["a missing field", {}],
    ["an empty string", { imdb_id: "" }],
    ["an explicit null", { imdb_id: null }],
    ["a bare number", { imdb_id: "133093" }],
    ["a short id", { imdb_id: "tt133" }],
  ])("drops %s", (_label, payload) => {
    expect(mapExternalIds(payload)).toEqual({ imdbId: null });
  });

  it("keeps a well-formed id, trimmed", () => {
    expect(mapExternalIds({ imdb_id: " tt0133093 " })).toEqual({ imdbId: "tt0133093" });
  });
});
