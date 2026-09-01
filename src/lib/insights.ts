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

/** How much of the year the top of the page is describing. */
export type InsightsPeriod = "week" | "month" | "year";

export type InsightsScope = {
  /** The year the reader has chosen. */
  year: number;
  /** The reader's own today, as YYYY-MM-DD: a browser just past midnight on
      1 January is in a different year from the server. */
  today: string;
  period: InsightsPeriod;
};

export type InsightsSummary = {
  year: number;
  period: InsightsPeriod;
  /** Inclusive bounds of the chosen period, so the page can name what it is
      showing without recomputing the calendar. */
  periodStart: string;
  periodEnd: string;
  availableYears: number[];

  /* Everything from here to the year-wide block describes the period only. */
  watches: number;
  uniqueTitles: number;
  movies: number;
  series: number;
  rewatches: number;
  /** Distinct dates with a viewing on them: occasions, not viewings. */
  daysWatched: number;
  /** Days of the period that have actually happened, which is what makes
      "4 of 7" honest on a Wednesday. */
  daysInPeriod: number;
  ratedWatches: number;
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

  /* Year-wide: the shape of the whole year, whatever period is selected. */
  yearWatches: number;
  monthlyBuckets: MonthlyBucket[];
  mostActiveMonth: MonthlyBucket | null;
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

const DAY_MS = 86_400_000;

/* Dates are handled as UTC midnights and compared as YYYY-MM-DD strings.
   `watched_on` is a date, not an instant, so giving it a timezone would only
   invent a way for a viewing to land on the wrong day. */
function utcDay(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

function dayString(value: Date) {
  return value.toISOString().slice(0, 10);
}

function shiftDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_MS);
}

function parseDay(value: string) {
  return utcDay(Number(value.slice(0, 4)), Number(value.slice(5, 7)), Number(value.slice(8, 10)));
}

/** Weeks run Monday to Sunday. */
function weekStart(value: Date) {
  return shiftDays(value, -((value.getUTCDay() + 6) % 7));
}

/**
 * The inclusive bounds of the chosen period. A week is a real week, so one
 * that opened in December stays whole rather than being clipped to the year:
 * "this week" means the week, not the part of it this year has seen.
 */
export function periodBounds({ year, today, period }: InsightsScope) {
  if (period === "week") {
    const start = weekStart(parseDay(today));
    return { start: dayString(start), end: dayString(shiftDays(start, 6)) };
  }

  if (period === "month") {
    const month = Number(today.slice(5, 7));
    const start = utcDay(year, month, 1);
    return { start: dayString(start), end: dayString(shiftDays(utcDay(year, month + 1, 1), -1)) };
  }

  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/* Chronological, with the id as the tie-break so two viewings on one day keep
   a stable order everywhere they are counted or listed. */
function chronological(left: InsightsEvent, right: InsightsEvent) {
  return left.watchedOn.localeCompare(right.watchedOn) || left.id.localeCompare(right.id);
}

/**
 * Aggregates one period out of the account's whole history. It takes every
 * event rather than one period's worth so a viewing can be told from a rewatch
 * of something first seen years ago, and it is pure so the numbers are
 * testable.
 *
 * Two spans come back from one pass: the chosen period, which is what the
 * stats and lists describe, and the selected year, which is what the
 * month-by-month shape is drawn from. They are separate on purpose — narrowing
 * to a week should not redraw the year.
 */
export function summarizeInsights(events: InsightsEvent[], scope: InsightsScope): InsightsSummary {
  const { year, today, period } = scope;
  const { start: periodStart, end: periodEnd } = periodBounds(scope);
  const ordered = [...events].sort(chronological);
  const seen = new Set<string>();
  const rewatched = new Set<string>();
  for (const event of ordered) {
    if (seen.has(event.mediaItemId)) rewatched.add(event.id);
    else seen.add(event.mediaItemId);
  }

  const inYear = ordered.filter((event) => yearOf(event.watchedOn) === year);
  const inPeriod = period === "year"
    ? inYear
    : ordered.filter((event) => event.watchedOn >= periodStart && event.watchedOn <= periodEnd);

  /* A period that has not finished is only as long as it has actually been. */
  const lastDay = today < periodEnd ? today : periodEnd;
  const daysInPeriod = Math.max(
    0,
    Math.round((parseDay(lastDay).getTime() - parseDay(periodStart).getTime()) / DAY_MS) + 1,
  );

  const monthlyBuckets: MonthlyBucket[] = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    watches: 0,
  }));
  for (const event of inYear) monthlyBuckets[monthOf(event.watchedOn) - 1].watches += 1;
  const ratingDistribution: RatingCount[] = Array.from({ length: 10 }, (_, index) => ({
    rating: index + 1,
    watches: 0,
  }));
  const genres = new Map<string, number>();
  const bestRating = new Map<string, RatedTitle>();

  let movies = 0;
  let series = 0;
  let ratedWatches = 0;
  let movieRuntimeMinutes = 0;
  let moviesWithKnownRuntime = 0;
  let watchesWithoutGenres = 0;

  for (const event of inPeriod) {
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
    period,
    periodStart,
    periodEnd,
    /* The year on screen is always offered, even before anything is watched. */
    availableYears: [...new Set([...ordered.map((event) => yearOf(event.watchedOn)), year])]
      .sort((left, right) => right - left),
    watches: inPeriod.length,
    uniqueTitles: new Set(inPeriod.map((event) => event.mediaItemId)).size,
    movies,
    series,
    rewatches: inPeriod.filter((event) => rewatched.has(event.id)).length,
    daysWatched: new Set(inPeriod.map((event) => event.watchedOn)).size,
    daysInPeriod,
    ratedWatches,
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
    recentHistory: [...inPeriod]
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
    yearWatches: inYear.length,
    monthlyBuckets,
    mostActiveMonth: mostActive.watches === 0 ? null : mostActive,
  };
}

/** What the period block is describing, in words the reader can check. */
export function periodRangeLabel(summary: {
  period: InsightsPeriod;
  periodStart: string;
  periodEnd: string;
  year: number;
}) {
  if (summary.period === "year") return String(summary.year);
  if (summary.period === "month") return `${monthName(Number(summary.periodStart.slice(5, 7)))} ${summary.year}`;

  const from = parseDay(summary.periodStart);
  const to = parseDay(summary.periodEnd);
  const day = (value: Date) => value.getUTCDate();
  const short = (value: Date) => monthName(value.getUTCMonth() + 1).slice(0, 3);
  return from.getUTCMonth() === to.getUTCMonth()
    ? `${day(from)}–${day(to)} ${short(to)}`
    : `${day(from)} ${short(from)} – ${day(to)} ${short(to)}`;
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
