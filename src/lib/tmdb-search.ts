import "server-only";

import { createHash } from "node:crypto";

import { and, eq, gt } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { tmdbSearchCache } from "@/lib/db/schema";

export const TMDB_SEARCH_CACHE_TTL_MS = 30_000;

export type TmdbSearchResult = {
  provider: "tmdb";
  externalId: number;
  mediaType: "movie" | "tv";
  title: string;
  originalTitle: string | null;
  releaseYear: number | null;
  posterPath: string | null;
  overview: string | null;
  popularity: number;
  voteAverage: number | null;
};

type TmdbApiResult = {
  id: number;
  media_type: "movie" | "tv" | string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string | null;
  popularity?: number;
  vote_average?: number;
};

export function normalizeTmdbQuery(query: string) {
  return query.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
}

export function tmdbQueryCacheKey(query: string) {
  return createHash("sha256").update(normalizeTmdbQuery(query)).digest("base64url");
}

function releaseYear(date: string | undefined) {
  const match = date?.match(/^\d{4}/);
  return match ? Number(match[0]) : null;
}

export function mapTmdbResults(results: TmdbApiResult[]): TmdbSearchResult[] {
  return results
    .filter((result) => (result.media_type === "movie" || result.media_type === "tv") && Number.isInteger(result.id))
    .map((result) => ({
      provider: "tmdb" as const,
      externalId: result.id,
      mediaType: result.media_type as "movie" | "tv",
      title: result.media_type === "movie" ? result.title ?? "Untitled" : result.name ?? "Untitled",
      originalTitle:
        result.media_type === "movie" ? result.original_title ?? null : result.original_name ?? null,
      releaseYear: releaseYear(result.media_type === "movie" ? result.release_date : result.first_air_date),
      posterPath: result.poster_path ?? null,
      overview: result.overview?.trim() || null,
      popularity: typeof result.popularity === "number" ? result.popularity : 0,
      voteAverage: typeof result.vote_average === "number" ? result.vote_average : null,
    }));
}

export function parseRetryAfter(value: string | null, now = Date.now()) {
  if (!value) return 2;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1, Math.ceil(seconds));

  const date = Date.parse(value);
  if (Number.isNaN(date)) return 2;
  return Math.max(1, Math.ceil((date - now) / 1000));
}

export async function getCachedTmdbSearch(query: string, now = new Date()) {
  const key = tmdbQueryCacheKey(query);
  const [entry] = await db
    .select({ payload: tmdbSearchCache.payload })
    .from(tmdbSearchCache)
    .where(and(eq(tmdbSearchCache.key, key), gt(tmdbSearchCache.expiresAt, now)))
    .limit(1);

  if (!entry) return null;

  try {
    return JSON.parse(entry.payload) as TmdbSearchResult[];
  } catch {
    await db.delete(tmdbSearchCache).where(eq(tmdbSearchCache.key, key));
    return null;
  }
}

export async function cacheTmdbSearch(query: string, results: TmdbSearchResult[], now = Date.now()) {
  const key = tmdbQueryCacheKey(query);
  const expiresAt = new Date(now + TMDB_SEARCH_CACHE_TTL_MS);
  const payload = JSON.stringify(results);

  await db
    .insert(tmdbSearchCache)
    .values({ key, payload, expiresAt })
    .onConflictDoUpdate({
      target: tmdbSearchCache.key,
      set: { payload, expiresAt },
    });
}
