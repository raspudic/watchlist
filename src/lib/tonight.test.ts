import { describe, expect, it } from "vitest";

import type { MediaItem } from "@/lib/library-cache";
import {
  DEFAULT_TONIGHT_FILTERS,
  candidateWeight,
  genreOptions,
  mediaTypeCounts,
  moodOptions,
  narrowCandidates,
  pickCandidate,
  readTonightFilters,
  rememberPick,
  sortCandidates,
  type TonightCandidate,
  type TonightFilters,
  tonightFilterQuery,
} from "@/lib/tonight";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-01T20:00:00.000Z");

function candidate(
  id: string,
  overrides: Omit<Partial<TonightCandidate>, "item"> & { item?: Partial<MediaItem> } = {},
): TonightCandidate {
  const { item, ...rest } = overrides;
  return {
    item: {
      id,
      provider: "tmdb",
      externalId: 1,
      mediaType: "movie",
      title: id,
      originalTitle: null,
      releaseYear: 2020,
      posterPath: null,
      overview: null,
      status: "watchlist",
      watchlistNote: null,
      reviewNote: null,
      rating: null,
      addedAt: new Date(NOW - DAY).toISOString(),
      watchedAt: null,
      pinnedAt: null,
      ...item,
    },
    genres: [],
    runtimeMinutes: null,
    voteAverage: null,
    voteCount: null,
    releaseDate: null,
    streaming: [],
    availabilityCheckedAt: null,
    ...rest,
  };
}

const filters = (overrides: Partial<TonightFilters> = {}): TonightFilters => ({
  ...DEFAULT_TONIGHT_FILTERS,
  ...overrides,
});

const comedy = { id: 35, name: "Comedy" };
const horror = { id: 27, name: "Horror" };
const drama = { id: 18, name: "Drama" };

describe("narrowCandidates", () => {
  const netflix = candidate("netflix", { streaming: [{ id: 8, name: "Netflix", logoPath: null }] });
  const nowhere = candidate("nowhere");

  it("keeps only titles on a selected service", () => {
    const kept = narrowCandidates([netflix, nowhere], filters({ services: "mine" }), [8]);

    expect(kept.map((entry) => entry.item.id)).toEqual(["netflix"]);
  });

  it("keeps everything when no service filter is asked for", () => {
    expect(narrowCandidates([netflix, nowhere], filters({ services: "all" }), [8])).toHaveLength(2);
  });

  it("filters by media type", () => {
    const series = candidate("series", { item: { mediaType: "tv" } });
    const kept = narrowCandidates([netflix, series], filters({ services: "all", mediaType: "tv" }), []);

    expect(kept.map((entry) => entry.item.id)).toEqual(["series"]);
  });

  it("drops titles with an unknown runtime rather than guessing they are short", () => {
    const short = candidate("short", { runtimeMinutes: 84 });
    const long = candidate("long", { runtimeMinutes: 140 });
    const unknown = candidate("unknown");

    const kept = narrowCandidates(
      [short, long, unknown],
      filters({ services: "all", runtime: "under-90" }),
      [],
    );

    expect(kept.map((entry) => entry.item.id)).toEqual(["short"]);
  });

  it("combines pills with AND, so each one narrows further", () => {
    const funnyDrama = candidate("both", { genres: [comedy, drama] });
    const justComedy = candidate("comedy", { genres: [comedy] });

    const kept = narrowCandidates(
      [funnyDrama, justComedy],
      filters({ services: "all", facets: ["mood:funny", "genre:18"] }),
      [],
    );

    expect(kept.map((entry) => entry.item.id)).toEqual(["both"]);
  });

  it("does not call a horror comedy light", () => {
    const horrorComedy = candidate("horror-comedy", { genres: [comedy, horror] });

    expect(narrowCandidates([horrorComedy], filters({ services: "all", facets: ["mood:light"] }), []))
      .toHaveLength(0);
    expect(narrowCandidates([horrorComedy], filters({ services: "all", facets: ["mood:funny"] }), []))
      .toHaveLength(1);
  });
});

describe("facet options", () => {
  const candidates = [
    candidate("a", { genres: [comedy] }),
    candidate("b", { genres: [drama] }),
    candidate("c", { genres: [drama, horror] }),
  ];

  it("counts each pill against everything else already selected", () => {
    const options = moodOptions(candidates, filters({ services: "all", facets: ["mood:emotional"] }), []);
    const byId = Object.fromEntries(options.map((option) => [option.key, option]));

    expect(byId["mood:emotional"]).toMatchObject({ count: 2, selected: true });
    expect(byId["mood:dark"]).toMatchObject({ count: 1, selected: false });
    /* Nothing emotional is also funny here, so the pill can be disabled. */
    expect(byId["mood:funny"].count).toBe(0);
  });

  it("offers only the genres that are actually saved, in alphabetical order", () => {
    const options = genreOptions(candidates, filters({ services: "all" }), []);

    expect(options.map((option) => option.label)).toEqual(["Comedy", "Drama", "Horror"]);
    expect(options.map((option) => option.count)).toEqual([1, 2, 1]);
  });

  it("counts each media type with the other filters still applied", () => {
    const series = candidate("series", { genres: [comedy], item: { mediaType: "tv" } });

    expect(mediaTypeCounts([...candidates, series], filters({ services: "all", facets: ["genre:35"] }), []))
      .toEqual({ all: 2, movie: 1, tv: 1 });
  });
});

describe("sortCandidates", () => {
  const older = candidate("older", { item: { title: "Older", addedAt: new Date(NOW - 40 * DAY).toISOString() } });
  const newer = candidate("newer", { item: { title: "Newer", addedAt: new Date(NOW - DAY).toISOString() } });
  const pinned = candidate("pinned", {
    item: {
      title: "Pinned",
      addedAt: new Date(NOW - 2 * DAY).toISOString(),
      pinnedAt: new Date(NOW - 60 * 1000).toISOString(),
    },
  });

  it("puts pinned titles first, then the longest-waiting", () => {
    expect(sortCandidates([newer, older, pinned], "pinned").map((entry) => entry.item.id))
      .toEqual(["pinned", "older", "newer"]);
  });

  it("sorts by saved date, newest release and score", () => {
    const old = candidate("old", { releaseDate: "1999-03-31", voteAverage: 8.2, voteCount: 100 });
    const recent = candidate("recent", { releaseDate: "2025-11-02", voteAverage: 6.4, voteCount: 100 });

    expect(sortCandidates([newer, older], "oldest").map((entry) => entry.item.id)).toEqual(["older", "newer"]);
    expect(sortCandidates([old, recent], "release").map((entry) => entry.item.id)).toEqual(["recent", "old"]);
    expect(sortCandidates([recent, old], "score").map((entry) => entry.item.id)).toEqual(["old", "recent"]);
  });

  it("breaks ties on the title so a redraw keeps the same order", () => {
    const first = candidate("2", { item: { title: "Arrival" } });
    const second = candidate("1", { item: { title: "Brazil" } });

    expect(sortCandidates([second, first], "score").map((entry) => entry.item.title))
      .toEqual(["Arrival", "Brazil"]);
  });

  it("sorts titles with no release date last", () => {
    const dated = candidate("dated", { releaseDate: "2001-01-01" });
    const undated = candidate("undated", { item: { releaseYear: null } });

    expect(sortCandidates([undated, dated], "release").map((entry) => entry.item.id))
      .toEqual(["dated", "undated"]);
  });
});

describe("pickCandidate", () => {
  const plain = candidate("plain");
  const pinned = candidate("pinned", { item: { pinnedAt: new Date(NOW).toISOString() } });

  it("weights a pinned title three times as heavily", () => {
    expect(candidateWeight(pinned, NOW) / candidateWeight(plain, NOW)).toBeCloseTo(3);
  });

  it("gives a title that has waited longer more weight", () => {
    const waiting = candidate("waiting", { item: { addedAt: new Date(NOW - 365 * DAY).toISOString() } });

    expect(candidateWeight(waiting, NOW)).toBeGreaterThan(candidateWeight(plain, NOW));
  });

  it("returns the title the generator lands on", () => {
    /* Weights are 3 and 1 of 4, so anything under 0.75 lands on the pin. */
    expect(pickCandidate([pinned, plain], { now: NOW, random: () => 0.74 })?.item.id).toBe("pinned");
    expect(pickCandidate([pinned, plain], { now: NOW, random: () => 0.76 })?.item.id).toBe("plain");
  });

  it("skips the last few picks, and repeats only when there is nothing else", () => {
    expect(pickCandidate([pinned, plain], { now: NOW, random: () => 0, recentIds: ["pinned"] })?.item.id)
      .toBe("plain");
    expect(pickCandidate([pinned], { now: NOW, random: () => 0, recentIds: ["pinned"] })?.item.id)
      .toBe("pinned");
  });

  it("has nothing to offer for an empty list", () => {
    expect(pickCandidate([], { now: NOW, random: () => 0.5 })).toBeNull();
  });

  it("remembers only the last three picks, most recent first", () => {
    const remembered = ["c", "b", "a"].reduce(rememberPick, [] as string[]);

    expect(remembered).toEqual(["a", "b", "c"]);
    expect(rememberPick(remembered, "d")).toEqual(["d", "a", "b"]);
    expect(rememberPick(remembered, "c")).toEqual(["c", "a", "b"]);
  });
});

describe("filter query", () => {
  it("round-trips everything that differs from the defaults", () => {
    const chosen = filters({
      services: "all",
      mediaType: "tv",
      runtime: "under-120",
      facets: ["mood:dark", "genre:80"],
      sort: "score",
    });

    expect(readTonightFilters(new URLSearchParams(tonightFilterQuery(chosen)))).toEqual(chosen);
  });

  it("writes nothing for the default view", () => {
    expect(tonightFilterQuery(DEFAULT_TONIGHT_FILTERS)).toBe("");
  });

  it("ignores values it did not write", () => {
    const parsed = readTonightFilters(new URLSearchParams(
      "services=someone-elses&type=film&runtime=0&sort=random&pills=mood:dark,genre:abc,drop table,genre:80,mood:dark",
    ));

    expect(parsed).toEqual(filters({ facets: ["mood:dark", "genre:80"] }));
  });
});
