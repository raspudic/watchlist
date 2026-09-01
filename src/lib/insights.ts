export type InsightsMediaType = "movie" | "tv" | "other";

/** One viewing, with whatever the catalog knows about the title behind it. */
export type InsightsEvent = {
  id: string;
  mediaItemId: string;
  watchedOn: string;
  rating: number | null;
  title: string;
  mediaType: InsightsMediaType;
  posterPath: string | null;
  /** Movies only: a series runtime is one episode, not the whole thing. */
  runtimeMinutes: number | null;
  genres: string[];
};

export type MonthlyBucket = { month: number; watches: number };
export type GenreCount = { name: string; watches: number };
export type RatingCount = { rating: number; watches: number };

export type RatedTitle = {
  mediaItemId: string;
  title: string;
  posterPath: string | null;
  rating: number;
};

export type HistoryEntry = {
  id: string;
  mediaItemId: string;
  title: string;
  mediaType: InsightsMediaType;
  watchedOn: string;
  rating: number | null;
  rewatch: boolean;
};

export type InsightsSummary = {
  year: number;
  month: number;
  availableYears: number[];
  thisMonth: { watches: number; uniqueTitles: number };
  watches: number;
  uniqueTitles: number;
  movies: number;
  series: number;
  rewatches: number;
  ratedWatches: number;
  averageRating: number | null;
  mostActiveMonth: MonthlyBucket | null;
  monthlyBuckets: MonthlyBucket[];
  ratingDistribution: RatingCount[];
  favoriteGenres: GenreCount[];
  highestRated: RatedTitle[];
  recentHistory: HistoryEntry[];
  /** Minutes of the movies whose runtime the catalog actually knows. */
  movieRuntimeMinutes: number;
  moviesWithKnownRuntime: number;
  /** Viewings of titles the catalog has no genres for, which is why a genre
      chart can look thinner than the totals above it. */
  watchesWithoutGenres: number;
};

export const FAVOURITE_GENRE_LIMIT = 6;
export const HIGHEST_RATED_LIMIT = 5;
export const RECENT_HISTORY_LIMIT = 8;

function yearOf(watchedOn: string) {
  return Number(watchedOn.slice(0, 4));
}

function monthOf(watchedOn: string) {
  return Number(watchedOn.slice(5, 7));
}

/* Chronological, with the id as the tie-break so two viewings on one day keep
   a stable order everywhere they are counted or listed. */
function chronological(left: InsightsEvent, right: InsightsEvent) {
  return left.watchedOn.localeCompare(right.watchedOn) || left.id.localeCompare(right.id);
}

/**
 * Aggregates a year out of the account's whole history. It takes every event
 * rather than one year's worth so a viewing can be told from a rewatch of
 * something first seen years ago, and it is pure so the numbers are testable.
 */
export function summarizeInsights(
  events: InsightsEvent[],
  { year, month }: { year: number; month: number },
): InsightsSummary {
  const ordered = [...events].sort(chronological);
  const seen = new Set<string>();
  const rewatched = new Set<string>();
  for (const event of ordered) {
    if (seen.has(event.mediaItemId)) rewatched.add(event.id);
    else seen.add(event.mediaItemId);
  }

  const inYear = ordered.filter((event) => yearOf(event.watchedOn) === year);
  const thisMonth = inYear.filter((event) => monthOf(event.watchedOn) === month);

  const monthlyBuckets: MonthlyBucket[] = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    watches: 0,
  }));
  const ratingDistribution: RatingCount[] = Array.from({ length: 10 }, (_, index) => ({
    rating: index + 1,
    watches: 0,
  }));
  const genres = new Map<string, number>();
  const bestRating = new Map<string, RatedTitle>();

  let movies = 0;
  let series = 0;
  let ratedWatches = 0;
  let ratingTotal = 0;
  let movieRuntimeMinutes = 0;
  let moviesWithKnownRuntime = 0;
  let watchesWithoutGenres = 0;

  for (const event of inYear) {
    monthlyBuckets[monthOf(event.watchedOn) - 1].watches += 1;

    if (event.mediaType === "movie") {
      movies += 1;
      if (event.runtimeMinutes !== null && event.runtimeMinutes > 0) {
        movieRuntimeMinutes += event.runtimeMinutes;
        moviesWithKnownRuntime += 1;
      }
    }
    if (event.mediaType === "tv") series += 1;

    if (event.rating !== null && event.rating >= 1 && event.rating <= 10) {
      ratedWatches += 1;
      ratingTotal += event.rating;
      ratingDistribution[event.rating - 1].watches += 1;

      const best = bestRating.get(event.mediaItemId);
      if (!best || event.rating > best.rating) {
        bestRating.set(event.mediaItemId, {
          mediaItemId: event.mediaItemId,
          title: event.title,
          posterPath: event.posterPath,
          rating: event.rating,
        });
      }
    }

    if (event.genres.length === 0) watchesWithoutGenres += 1;
    /* Weighted by viewing: watching three thrillers says more than owning one. */
    for (const genre of event.genres) genres.set(genre, (genres.get(genre) ?? 0) + 1);
  }

  const mostActive = monthlyBuckets.reduce(
    (best, bucket) => (bucket.watches > best.watches ? bucket : best),
    monthlyBuckets[0],
  );

  return {
    year,
    month,
    /* The year on screen is always offered, even before anything is watched. */
    availableYears: [...new Set([...ordered.map((event) => yearOf(event.watchedOn)), year])]
      .sort((left, right) => right - left),
    thisMonth: {
      watches: thisMonth.length,
      uniqueTitles: new Set(thisMonth.map((event) => event.mediaItemId)).size,
    },
    watches: inYear.length,
    uniqueTitles: new Set(inYear.map((event) => event.mediaItemId)).size,
    movies,
    series,
    rewatches: inYear.filter((event) => rewatched.has(event.id)).length,
    ratedWatches,
    averageRating: ratedWatches === 0 ? null : ratingTotal / ratedWatches,
    mostActiveMonth: mostActive.watches === 0 ? null : mostActive,
    monthlyBuckets,
    ratingDistribution,
    favoriteGenres: [...genres.entries()]
      .map(([name, watches]) => ({ name, watches }))
      .sort((left, right) => right.watches - left.watches || left.name.localeCompare(right.name))
      .slice(0, FAVOURITE_GENRE_LIMIT),
    highestRated: [...bestRating.values()]
      .sort((left, right) => right.rating - left.rating
        || left.title.localeCompare(right.title)
        || left.mediaItemId.localeCompare(right.mediaItemId))
      .slice(0, HIGHEST_RATED_LIMIT),
    recentHistory: [...inYear]
      .reverse()
      .slice(0, RECENT_HISTORY_LIMIT)
      .map((event) => ({
        id: event.id,
        mediaItemId: event.mediaItemId,
        title: event.title,
        mediaType: event.mediaType,
        watchedOn: event.watchedOn,
        rating: event.rating,
        rewatch: rewatched.has(event.id),
      })),
    movieRuntimeMinutes,
    moviesWithKnownRuntime,
    watchesWithoutGenres,
  };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthName(month: number) {
  return MONTH_NAMES[month - 1] ?? "";
}

/** Whole hours read better than 4 271 minutes; the remainder still shows. */
export function runtimeSummary(minutes: number) {
  if (minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
