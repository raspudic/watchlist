import { describe, expect, it } from "vitest";

import {
  type InsightsEvent,
  monthName,
  runtimeSummary,
  summarizeInsights,
} from "@/lib/insights";

let sequence = 0;

function event(overrides: Partial<InsightsEvent> = {}): InsightsEvent {
  sequence += 1;
  return {
    id: `event-${String(sequence).padStart(3, "0")}`,
    mediaItemId: "item-1",
    watchedOn: "2026-03-04",
    rating: null,
    title: "The Matrix",
    mediaType: "movie",
    posterPath: null,
    runtimeMinutes: null,
    genres: [],
    ...overrides,
  };
}

const period = { year: 2026, month: 9 };

describe("summarizeInsights", () => {
  it("counts a year without letting other years in", () => {
    const summary = summarizeInsights(
      [
        event({ mediaItemId: "a", watchedOn: "2025-12-31" }),
        event({ mediaItemId: "b", watchedOn: "2026-01-01" }),
        event({ mediaItemId: "c", watchedOn: "2026-09-14", mediaType: "tv" }),
      ],
      period,
    );

    expect(summary.watches).toBe(2);
    expect(summary.uniqueTitles).toBe(2);
    expect(summary.movies).toBe(1);
    expect(summary.series).toBe(1);
    expect(summary.thisMonth).toEqual({ watches: 1, uniqueTitles: 1 });
    expect(summary.availableYears).toEqual([2026, 2025]);
  });

  it("offers the year on screen even when nothing was watched in it", () => {
    expect(summarizeInsights([], period).availableYears).toEqual([2026]);
    expect(summarizeInsights([], period).mostActiveMonth).toBeNull();
  });

  it("counts a viewing as a rewatch when the title was seen before, even years earlier", () => {
    const summary = summarizeInsights(
      [
        event({ mediaItemId: "a", watchedOn: "2019-04-02" }),
        event({ mediaItemId: "a", watchedOn: "2026-04-02" }),
        event({ mediaItemId: "b", watchedOn: "2026-05-02" }),
        event({ mediaItemId: "b", watchedOn: "2026-06-02" }),
      ],
      period,
    );

    expect(summary.watches).toBe(3);
    expect(summary.uniqueTitles).toBe(2);
    expect(summary.rewatches).toBe(2);
  });

  it("always returns twelve months and names the busiest", () => {
    const summary = summarizeInsights(
      [
        event({ watchedOn: "2026-02-01" }),
        event({ watchedOn: "2026-07-01" }),
        event({ watchedOn: "2026-07-20" }),
      ],
      period,
    );

    expect(summary.monthlyBuckets).toHaveLength(12);
    expect(summary.monthlyBuckets[6]).toEqual({ month: 7, watches: 2 });
    expect(summary.monthlyBuckets[0]).toEqual({ month: 1, watches: 0 });
    expect(summary.mostActiveMonth).toEqual({ month: 7, watches: 2 });
  });

  it("averages the snapshots that carry a rating and ignores the rest", () => {
    const summary = summarizeInsights(
      [
        event({ mediaItemId: "a", rating: 8 }),
        event({ mediaItemId: "b", rating: 6 }),
        event({ mediaItemId: "c", rating: null }),
      ],
      period,
    );

    expect(summary.ratedWatches).toBe(2);
    expect(summary.averageRating).toBe(7);
    expect(summary.ratingDistribution).toHaveLength(10);
    expect(summary.ratingDistribution[7]).toEqual({ rating: 8, watches: 1 });
  });

  it("has no average to report when nothing was rated", () => {
    expect(summarizeInsights([event()], period).averageRating).toBeNull();
  });

  it("weights genres by viewing and counts what the catalog cannot explain", () => {
    const summary = summarizeInsights(
      [
        event({ mediaItemId: "a", genres: ["Drama", "Thriller"] }),
        event({ mediaItemId: "b", genres: ["Thriller"] }),
        event({ mediaItemId: "c", genres: [] }),
      ],
      period,
    );

    expect(summary.favoriteGenres).toEqual([
      { name: "Thriller", watches: 2 },
      { name: "Drama", watches: 1 },
    ]);
    expect(summary.watchesWithoutGenres).toBe(1);
  });

  it("keeps one entry per title in the highest rated, at its best score", () => {
    const summary = summarizeInsights(
      [
        event({ mediaItemId: "a", title: "Arrival", rating: 7 }),
        event({ mediaItemId: "a", title: "Arrival", rating: 9 }),
        event({ mediaItemId: "b", title: "Brazil", rating: 9 }),
      ],
      period,
    );

    expect(summary.highestRated.map((title) => `${title.title}:${title.rating}`))
      .toEqual(["Arrival:9", "Brazil:9"]);
  });

  it("only sums the runtime of films the catalog actually knows", () => {
    const summary = summarizeInsights(
      [
        event({ mediaItemId: "a", runtimeMinutes: 136 }),
        event({ mediaItemId: "b", runtimeMinutes: null }),
        /* A series runtime describes one episode, so it never reaches here. */
        event({ mediaItemId: "c", mediaType: "tv", runtimeMinutes: null }),
      ],
      period,
    );

    expect(summary.movieRuntimeMinutes).toBe(136);
    expect(summary.moviesWithKnownRuntime).toBe(1);
  });

  it("lists the latest viewings first and marks the repeats", () => {
    const summary = summarizeInsights(
      [
        event({ mediaItemId: "a", title: "Arrival", watchedOn: "2026-01-02" }),
        event({ mediaItemId: "a", title: "Arrival", watchedOn: "2026-08-09" }),
        event({ mediaItemId: "b", title: "Brazil", watchedOn: "2026-04-05" }),
      ],
      period,
    );

    expect(summary.recentHistory.map((entry) => [entry.title, entry.watchedOn, entry.rewatch]))
      .toEqual([
        ["Arrival", "2026-08-09", true],
        ["Brazil", "2026-04-05", false],
        ["Arrival", "2026-01-02", false],
      ]);
  });

  it("keeps removed and custom titles in the count", () => {
    const summary = summarizeInsights(
      [
        event({ mediaItemId: "custom", mediaType: "other", title: "A home video" }),
        event({ mediaItemId: "removed", title: "Something removed" }),
      ],
      period,
    );

    expect(summary.watches).toBe(2);
    expect(summary.movies).toBe(1);
    expect(summary.series).toBe(0);
  });

  it("breaks ties on the name so the same year always reads the same", () => {
    const summary = summarizeInsights(
      [
        event({ mediaItemId: "a", genres: ["Western"] }),
        event({ mediaItemId: "b", genres: ["Comedy"] }),
      ],
      period,
    );

    expect(summary.favoriteGenres.map((genre) => genre.name)).toEqual(["Comedy", "Western"]);
  });
});

describe("labels", () => {
  it("names a month", () => {
    expect(monthName(9)).toBe("September");
    expect(monthName(13)).toBe("");
  });

  it("reads minutes as hours once there are enough of them", () => {
    expect(runtimeSummary(0)).toBeNull();
    expect(runtimeSummary(47)).toBe("47 min");
    expect(runtimeSummary(120)).toBe("2 h");
    expect(runtimeSummary(4_271)).toBe("71 h 11 min");
  });
});
