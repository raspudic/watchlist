import type { MediaItem } from "@/lib/library-cache";

export type TonightGenre = { id: number; name: string };

export type TonightProvider = {
  id: number;
  name: string;
  logoPath: string | null;
  /** Which of the account's countries stream the title on this service. */
  regions: string[];
};

export type TonightCandidate = {
  item: MediaItem;
  genres: TonightGenre[];
  runtimeMinutes: number | null;
  voteAverage: number | null;
  voteCount: number | null;
  releaseDate: string | null;
  /** Subscription, free and ad-supported services across the saved countries. */
  streaming: TonightProvider[];
  /** Null until the catalog has looked this title up at all. */
  availabilityCheckedAt: string | null;
};

/** What the catalog knows about one saved title, keyed back to the library row. */
export type TitleExtras = {
  mediaItemId: string;
  genres: TonightGenre[];
  runtimeMinutes: number | null;
  voteAverage: number | null;
  voteCount: number | null;
  releaseDate: string | null;
  /** Subscription, free and ad-supported services across the saved countries. */
  streaming: TonightProvider[];
  /** Null until the catalog has looked this title up at all. */
  availabilityCheckedAt: string | null;
};

export type WatchlistExtrasResponse = {
  /** The saved countries, home first; empty while Settings has not been visited. */
  regions: string[];
  titles: TitleExtras[];
};

/**
 * Joins the library rows the page already has with whatever enrichment has
 * arrived. A title the catalog has never seen still becomes a candidate, just
 * a barer one, so the list never waits on the catalog to render.
 */
export function buildCandidates(items: MediaItem[], titles: TitleExtras[]): TonightCandidate[] {
  const extras = new Map(titles.map((entry) => [entry.mediaItemId, entry]));

  return items.map((item) => {
    const entry = extras.get(item.id);
    return {
      item,
      genres: entry?.genres ?? [],
      runtimeMinutes: entry?.runtimeMinutes ?? null,
      voteAverage: entry?.voteAverage ?? null,
      voteCount: entry?.voteCount ?? null,
      releaseDate: entry?.releaseDate ?? null,
      streaming: entry?.streaming ?? [],
      availabilityCheckedAt: entry?.availabilityCheckedAt ?? null,
    };
  });
}

export type TonightResponse = {
  /** The saved countries, home first; empty while Settings has not been visited. */
  regions: string[];
  selectedProviderIds: number[];
  candidates: TonightCandidate[];
};

/*
 * Moods are ordinary TMDB genres in a bundle, so a mood pill can carry a real
 * count and disable itself when nothing matches. TV carries its own ids for
 * the same idea (Action & Adventure, Sci-Fi & Fantasy), so both are listed.
 */
export const MOODS = [
  { id: "funny", label: "Funny", genreIds: [35] },
  {
    id: "light",
    label: "Light",
    genreIds: [35, 16, 10751, 10402, 10762],
    /* A horror comedy is not what anyone means by light. */
    excludedGenreIds: [27, 53, 80, 10752, 10768],
  },
  { id: "emotional", label: "Emotional", genreIds: [18, 10749] },
  { id: "suspenseful", label: "Suspenseful", genreIds: [53, 80, 9648, 28, 10759] },
  { id: "dark", label: "Dark", genreIds: [27, 80, 53, 10752, 10768] },
  { id: "mind-bending", label: "Mind-bending", genreIds: [878, 10765, 9648, 14] },
  { id: "family-friendly", label: "Family-friendly", genreIds: [10751, 16, 10762] },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  genreIds: number[];
  excludedGenreIds?: number[];
}>;

export type MoodId = (typeof MOODS)[number]["id"];

/** `mood:<id>` or `genre:<tmdb id>`: one flat namespace for one row of pills. */
export type FacetKey = string;

export type MediaTypeFilter = "all" | "movie" | "tv";
export type RuntimeFilter = "any" | "under-90" | "under-120";
export type TonightSort = "recent" | "oldest" | "release" | "score";

export type TonightFilters = {
  mediaType: MediaTypeFilter;
  runtime: RuntimeFilter;
  /** Selected pills, combined with AND so narrowing never surprises. */
  facets: FacetKey[];
  sort: TonightSort;
};

export const DEFAULT_TONIGHT_FILTERS: TonightFilters = {
  mediaType: "all",
  runtime: "any",
  facets: [],
  sort: "recent",
};

export const RUNTIME_LIMITS: Record<RuntimeFilter, number | null> = {
  any: null,
  "under-90": 90,
  "under-120": 120,
};

export function moodFacetKey(id: MoodId): FacetKey {
  return `mood:${id}`;
}

export function genreFacetKey(id: number): FacetKey {
  return `genre:${id}`;
}

function genreIds(candidate: TonightCandidate) {
  return candidate.genres.map((genre) => genre.id);
}

export function matchesFacet(candidate: TonightCandidate, facet: FacetKey) {
  const ids = genreIds(candidate);

  if (facet.startsWith("genre:")) {
    const id = Number(facet.slice("genre:".length));
    return Number.isFinite(id) && ids.includes(id);
  }

  const mood = MOODS.find((entry) => moodFacetKey(entry.id) === facet);
  if (!mood) return false;
  const excluded = "excludedGenreIds" in mood ? (mood.excludedGenreIds as readonly number[]) : [];
  if (ids.some((id) => excluded.includes(id))) return false;
  return ids.some((id) => (mood.genreIds as readonly number[]).includes(id));
}

/**
 * Applies every active filter. Runtime deliberately drops titles with no known
 * runtime rather than guessing they are short enough.
 */
export function narrowCandidates(candidates: TonightCandidate[], filters: TonightFilters) {
  const runtimeLimit = RUNTIME_LIMITS[filters.runtime];

  return candidates.filter((candidate) => {
    if (filters.mediaType !== "all" && candidate.item.mediaType !== filters.mediaType) return false;
    if (runtimeLimit !== null) {
      if (candidate.runtimeMinutes === null) return false;
      if (candidate.runtimeMinutes > runtimeLimit) return false;
    }
    return filters.facets.every((facet) => matchesFacet(candidate, facet));
  });
}

export type FacetOption = {
  key: FacetKey;
  label: string;
  count: number;
  selected: boolean;
};

/**
 * Counts each pill against everything else that is already selected, so a pill
 * reading zero can be disabled: no combination of pills ever empties the list.
 */
function facetOption(
  candidates: TonightCandidate[],
  filters: TonightFilters,
  key: FacetKey,
  label: string,
): FacetOption {
  const selected = filters.facets.includes(key);
  const facets = selected ? filters.facets : [...filters.facets, key];
  return {
    key,
    label,
    count: narrowCandidates(candidates, { ...filters, facets }).length,
    selected,
  };
}

export function moodOptions(candidates: TonightCandidate[], filters: TonightFilters): FacetOption[] {
  return MOODS.map((mood) => facetOption(candidates, filters, moodFacetKey(mood.id), mood.label));
}

/**
 * Only genres someone actually has saved, so the row is a map of this library
 * rather than of TMDB. The biggest genres lead, because behind a disclosure the
 * first thing revealed should be the one that does the most work.
 *
 * What orders the row is not what the pill displays. A pill's number is counted
 * against whatever else is already on, so ordering by it would reshuffle every
 * pill on every click. The rank instead comes from a frozen baseline — this tab,
 * no pills, any length — and so moves only when the tab does.
 */
export function genreOptions(candidates: TonightCandidate[], filters: TonightFilters): FacetOption[] {
  const names = new Map<number, string>();
  for (const candidate of candidates) {
    for (const genre of candidate.genres) if (!names.has(genre.id)) names.set(genre.id, genre.name);
  }

  const baseline: TonightFilters = { ...filters, facets: [], runtime: "any" };

  return [...names.entries()]
    .map(([id, name]) => {
      const key = genreFacetKey(id);
      return {
        option: facetOption(candidates, filters, key, name),
        rank: narrowCandidates(candidates, { ...baseline, facets: [key] }).length,
      };
    })
    .sort((left, right) => right.rank - left.rank || left.option.label.localeCompare(right.option.label))
    .map((entry) => entry.option);
}

export function mediaTypeCounts(candidates: TonightCandidate[], filters: TonightFilters) {
  const count = (mediaType: MediaTypeFilter) =>
    narrowCandidates(candidates, { ...filters, mediaType }).length;
  return { all: count("all"), movie: count("movie"), tv: count("tv") };
}

function releaseKey(candidate: TonightCandidate) {
  if (candidate.releaseDate) return candidate.releaseDate;
  return candidate.item.releaseYear ? `${candidate.item.releaseYear}-00-00` : "";
}

/** Every comparison ends on the title, so equal rows keep a stable order. */
function byTitle(left: TonightCandidate, right: TonightCandidate) {
  return left.item.title.localeCompare(right.item.title) || left.item.id.localeCompare(right.item.id);
}

export function sortCandidates(candidates: TonightCandidate[], sort: TonightSort) {
  return [...candidates].sort((left, right) => {
    if (sort === "recent") {
      return Date.parse(right.item.addedAt) - Date.parse(left.item.addedAt) || byTitle(left, right);
    }

    if (sort === "oldest") {
      return Date.parse(left.item.addedAt) - Date.parse(right.item.addedAt) || byTitle(left, right);
    }

    if (sort === "release") {
      return releaseKey(right).localeCompare(releaseKey(left)) || byTitle(left, right);
    }

    const leftScore = left.voteAverage ?? -1;
    const rightScore = right.voteAverage ?? -1;
    return rightScore - leftScore
      || (right.voteCount ?? 0) - (left.voteCount ?? 0)
      || byTitle(left, right);
  });
}

/**
 * Pinning is a state, not one ordering among several: pinned titles lead the
 * list under every sort, and the sort control governs only what is left. Their
 * own order is the pinning itself, most recent first.
 */
export function partitionPinned(candidates: TonightCandidate[], sort: TonightSort) {
  const pinned = candidates.filter((candidate) => candidate.item.pinnedAt);
  const rest = candidates.filter((candidate) => !candidate.item.pinnedAt);

  return {
    pinned: pinned.sort((left, right) =>
      Date.parse(right.item.pinnedAt ?? "") - Date.parse(left.item.pinnedAt ?? "")
      || byTitle(left, right)),
    rest: sortCandidates(rest, sort),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long a saved title takes to reach its full patience bonus. */
const PATIENCE_DAYS = 180;

export function candidateWeight(candidate: TonightCandidate, now: number) {
  const ageDays = Math.max(0, (now - Date.parse(candidate.item.addedAt)) / DAY_MS);
  const patience = 1 + Math.min(1, ageDays / PATIENCE_DAYS);
  return (candidate.item.pinnedAt ? 3 : 1) * patience;
}

/**
 * Weighted pick over the already-filtered list. The clock and the generator are
 * arguments so a test can state exactly which title should come out.
 */
export function pickCandidate(
  candidates: TonightCandidate[],
  { now, random, recentIds = [] }: { now: number; random: () => number; recentIds?: string[] },
): TonightCandidate | null {
  if (candidates.length === 0) return null;

  const unseen = candidates.filter((candidate) => !recentIds.includes(candidate.item.id));
  const pool = unseen.length > 0 ? unseen : candidates;
  const weights = pool.map((candidate) => candidateWeight(candidate, now));
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  let cursor = Math.min(Math.max(random(), 0), 0.999_999) * total;
  for (const [index, candidate] of pool.entries()) {
    cursor -= weights[index];
    if (cursor < 0) return candidate;
  }

  return pool[pool.length - 1];
}

/** The picker only remembers enough to stop repeating itself immediately. */
export const RECENT_PICK_MEMORY = 3;

export function rememberPick(recentIds: string[], id: string) {
  return [id, ...recentIds.filter((current) => current !== id)].slice(0, RECENT_PICK_MEMORY);
}

const MEDIA_TYPE_FILTERS: MediaTypeFilter[] = ["all", "movie", "tv"];
const RUNTIME_FILTERS: RuntimeFilter[] = ["any", "under-90", "under-120"];
const SORTS: TonightSort[] = ["recent", "oldest", "release", "score"];

function readOption<T extends string>(value: string | null, allowed: T[], fallback: T): T {
  return allowed.includes((value ?? "") as T) ? (value as T) : fallback;
}

export function readTonightFilters(params: URLSearchParams): TonightFilters {
  const facets = (params.get("pills") ?? "")
    .split(",")
    .map((facet) => facet.trim())
    .filter((facet) => /^mood:[a-z-]+$/.test(facet) || /^genre:\d+$/.test(facet));

  return {
    mediaType: readOption(params.get("type"), MEDIA_TYPE_FILTERS, DEFAULT_TONIGHT_FILTERS.mediaType),
    runtime: readOption(params.get("runtime"), RUNTIME_FILTERS, DEFAULT_TONIGHT_FILTERS.runtime),
    facets: [...new Set(facets)],
    sort: readOption(params.get("sort"), SORTS, DEFAULT_TONIGHT_FILTERS.sort),
  };
}

/** Only what differs from the defaults, so a shared link stays readable. */
export function tonightFilterQuery(filters: TonightFilters) {
  const params = new URLSearchParams();
  if (filters.mediaType !== DEFAULT_TONIGHT_FILTERS.mediaType) params.set("type", filters.mediaType);
  if (filters.runtime !== DEFAULT_TONIGHT_FILTERS.runtime) params.set("runtime", filters.runtime);
  if (filters.facets.length > 0) params.set("pills", filters.facets.join(","));
  if (filters.sort !== DEFAULT_TONIGHT_FILTERS.sort) params.set("sort", filters.sort);
  return params.toString();
}
