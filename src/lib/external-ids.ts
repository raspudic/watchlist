import "server-only";

import { readTmdbCache, writeTmdbCache } from "@/lib/tmdb-cache";
import type { LinkableMediaType } from "@/lib/title-links";

/** A title's id on another service is assigned once and then never moves. */
export const EXTERNAL_ID_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type TitleExternalIds = { imdbId: string | null };

export type TmdbExternalIdPayload = { imdb_id?: string | null };

export function externalIdCacheKey(mediaType: LinkableMediaType, tmdbId: number) {
  return `external:${mediaType}:${tmdbId}`;
}

/**
 * TMDB carries whatever a contributor typed, and the field is routinely empty
 * or left as a bare number. An id only survives if it looks like an IMDb one,
 * because anything else would build a link straight to a 404.
 */
export function mapExternalIds(payload: TmdbExternalIdPayload): TitleExternalIds {
  const imdbId = payload.imdb_id?.trim();
  return { imdbId: imdbId && /^tt\d{7,}$/.test(imdbId) ? imdbId : null };
}

export function getCachedExternalIds(
  mediaType: LinkableMediaType,
  tmdbId: number,
  now = new Date(),
) {
  return readTmdbCache<TitleExternalIds>(externalIdCacheKey(mediaType, tmdbId), now);
}

export function cacheExternalIds(
  mediaType: LinkableMediaType,
  tmdbId: number,
  ids: TitleExternalIds,
  now = Date.now(),
) {
  return writeTmdbCache(externalIdCacheKey(mediaType, tmdbId), ids, EXTERNAL_ID_CACHE_TTL_MS, now);
}
