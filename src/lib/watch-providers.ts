import "server-only";

import { readTmdbCache, writeTmdbCache } from "@/lib/tmdb-cache";

/** JustWatch ships one export per day, so a title's availability moves slowly. */
export const WATCH_PROVIDER_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
/** The list of supported countries changes a handful of times a year. */
export const WATCH_REGION_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type WatchMediaType = "movie" | "tv";

export type WatchProvider = {
  id: number;
  name: string;
  logoPath: string | null;
};

export type TitleWatchProviders = {
  region: string;
  /** TMDB's regional watch page. Null when TMDB has no availability at all. */
  link: string | null;
  /** Subscription, free and ad-supported services: what you can watch tonight. */
  streaming: WatchProvider[];
  /** Rent and buy, minus anything already listed as streaming. */
  rentOrBuy: WatchProvider[];
};

export type WatchRegion = { code: string; name: string };

type TmdbProvider = {
  provider_id?: number;
  provider_name?: string;
  logo_path?: string | null;
  display_priority?: number;
};

type TmdbRegionAvailability = {
  link?: string;
  flatrate?: TmdbProvider[];
  free?: TmdbProvider[];
  ads?: TmdbProvider[];
  rent?: TmdbProvider[];
  buy?: TmdbProvider[];
};

export type TmdbWatchProviderPayload = {
  results?: Record<string, TmdbRegionAvailability | undefined>;
};

export type TmdbWatchRegionPayload = {
  results?: { iso_3166_1?: string; english_name?: string; native_name?: string }[];
};

export function watchProviderCacheKey(mediaType: WatchMediaType, tmdbId: number, region: string) {
  return `${mediaType}:${tmdbId}:${region}`;
}

/**
 * Flattens TMDB's per-offer-type lists into the two groups the sheet shows.
 * A provider routinely appears under both flatrate and rent, so entries are
 * deduplicated by provider id and streaming always wins the tie.
 */
function collect(groups: (TmdbProvider[] | undefined)[], exclude?: Set<number>) {
  const byId = new Map<number, { provider: WatchProvider; priority: number }>();

  for (const group of groups) {
    for (const entry of group ?? []) {
      const id = entry.provider_id;
      const name = entry.provider_name?.trim();
      if (id === undefined || !Number.isInteger(id) || !name) continue;
      if (exclude?.has(id)) continue;

      const priority = typeof entry.display_priority === "number" ? entry.display_priority : 9999;
      const existing = byId.get(id);
      if (existing && existing.priority <= priority) continue;

      byId.set(id, { priority, provider: { id, name, logoPath: entry.logo_path ?? null } });
    }
  }

  return [...byId.values()]
    .sort((a, b) => a.priority - b.priority || a.provider.name.localeCompare(b.provider.name))
    .map((entry) => entry.provider);
}

export function mapWatchProviders(
  payload: TmdbWatchProviderPayload,
  region: string,
): TitleWatchProviders {
  const availability = payload.results?.[region];
  if (!availability) return { region, link: null, streaming: [], rentOrBuy: [] };

  const streaming = collect([availability.flatrate, availability.free, availability.ads]);
  const streamingIds = new Set(streaming.map((provider) => provider.id));

  return {
    region,
    link: availability.link?.trim() || null,
    streaming,
    rentOrBuy: collect([availability.rent, availability.buy], streamingIds),
  };
}

export function mapWatchRegions(payload: TmdbWatchRegionPayload): WatchRegion[] {
  return (payload.results ?? [])
    .flatMap((entry) => {
      const code = entry.iso_3166_1?.trim().toUpperCase();
      const name = entry.english_name?.trim() || entry.native_name?.trim();
      if (!code || !/^[A-Z]{2}$/.test(code) || !name) return [];
      return [{ code, name }];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getCachedWatchProviders(
  mediaType: WatchMediaType,
  tmdbId: number,
  region: string,
  now = new Date(),
) {
  return readTmdbCache<TitleWatchProviders>(watchProviderCacheKey(mediaType, tmdbId, region), now);
}

export function cacheWatchProviders(
  mediaType: WatchMediaType,
  tmdbId: number,
  region: string,
  providers: TitleWatchProviders,
  now = Date.now(),
) {
  return writeTmdbCache(
    watchProviderCacheKey(mediaType, tmdbId, region),
    providers,
    WATCH_PROVIDER_CACHE_TTL_MS,
    now,
  );
}

const WATCH_REGIONS_CACHE_KEY = "regions:en-US";

export function getCachedWatchRegions(now = new Date()) {
  return readTmdbCache<WatchRegion[]>(WATCH_REGIONS_CACHE_KEY, now);
}

export function cacheWatchRegions(regions: WatchRegion[], now = Date.now()) {
  return writeTmdbCache(WATCH_REGIONS_CACHE_KEY, regions, WATCH_REGION_CACHE_TTL_MS, now);
}
