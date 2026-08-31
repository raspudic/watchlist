import "server-only";

import { and, asc, eq, gt, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  catalogAvailability,
  catalogAvailabilityServices,
  catalogTitleGenres,
  catalogTitles,
  mediaItems,
  streamingProviders,
} from "@/lib/db/schema";
import type { TmdbSearchResult } from "@/lib/tmdb-search";
import type {
  TitleWatchProviders,
  TmdbWatchProviderPayload,
  WatchMediaType,
} from "@/lib/watch-providers";

export const CATALOG_METADATA_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CATALOG_AVAILABILITY_TTL_MS = 12 * 60 * 60 * 1000;

export type CatalogMediaType = "movie" | "tv";
export type CatalogAccessType = "streaming" | "rent_or_buy";

export type CatalogGenre = { id: number; name: string };

export type CatalogTitleMetadata = {
  id: string;
  provider: "tmdb";
  externalId: number;
  mediaType: CatalogMediaType;
  title: string;
  originalTitle: string | null;
  releaseDate: string | null;
  releaseYear: number | null;
  posterPath: string | null;
  overview: string | null;
  runtimeMinutes: number | null;
  voteAverage: number | null;
  voteCount: number | null;
  popularity: number | null;
  genres: CatalogGenre[];
};

type TmdbGenre = { id?: number; name?: string };

export type TmdbTitleDetailsPayload = {
  id?: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string | null;
  runtime?: number | null;
  episode_run_time?: number[] | null;
  last_episode_to_air?: { runtime?: number | null } | null;
  genres?: TmdbGenre[];
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
};

type TmdbAvailabilityProvider = {
  provider_id?: number;
  provider_name?: string;
  logo_path?: string | null;
  display_priority?: number;
};

type TmdbRegionAvailability = {
  link?: string;
  flatrate?: TmdbAvailabilityProvider[];
  free?: TmdbAvailabilityProvider[];
  ads?: TmdbAvailabilityProvider[];
  rent?: TmdbAvailabilityProvider[];
  buy?: TmdbAvailabilityProvider[];
};

export type CatalogAvailabilitySnapshot = {
  providers: Array<{ id: number; name: string; logoPath: string | null }>;
  regions: Array<{
    region: string;
    link: string | null;
    services: Array<{
      providerId: number;
      accessType: CatalogAccessType;
      displayPriority: number;
    }>;
  }>;
};

export function catalogTitleId(mediaType: CatalogMediaType, externalId: number) {
  return `tmdb:${mediaType}:${externalId}`;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function normalizedDate(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function tvRuntime(payload: TmdbTitleDetailsPayload) {
  const runtimes = (payload.episode_run_time ?? [])
    .filter((value) => Number.isInteger(value) && value > 0)
    .sort((a, b) => a - b);
  if (runtimes.length > 0) return runtimes[Math.floor(runtimes.length / 2)];
  return positiveInteger(payload.last_episode_to_air?.runtime);
}

/** Map movie/series detail responses without letting malformed upstream fields into the catalog. */
export function mapTmdbTitleDetails(
  mediaType: CatalogMediaType,
  payload: TmdbTitleDetailsPayload,
): CatalogTitleMetadata | null {
  const externalId = positiveInteger(payload.id);
  const title = (mediaType === "movie" ? payload.title : payload.name)?.trim();
  if (!externalId || !title) return null;

  const releaseDate = normalizedDate(
    mediaType === "movie" ? payload.release_date : payload.first_air_date,
  );
  const genres = new Map<number, CatalogGenre>();
  for (const genre of payload.genres ?? []) {
    const id = positiveInteger(genre.id);
    const name = genre.name?.trim();
    if (id && name) genres.set(id, { id, name });
  }

  const voteCount = finiteNumber(payload.vote_count);
  const voteAverage = finiteNumber(payload.vote_average);

  return {
    id: catalogTitleId(mediaType, externalId),
    provider: "tmdb",
    externalId,
    mediaType,
    title,
    originalTitle:
      (mediaType === "movie" ? payload.original_title : payload.original_name)?.trim() || null,
    releaseDate,
    releaseYear: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
    posterPath: payload.poster_path?.trim() || null,
    overview: payload.overview?.trim() || null,
    runtimeMinutes: mediaType === "movie" ? positiveInteger(payload.runtime) : tvRuntime(payload),
    voteAverage: voteCount !== null && voteCount > 0 ? voteAverage : null,
    voteCount: voteCount === null ? null : Math.max(0, Math.trunc(voteCount)),
    popularity: finiteNumber(payload.popularity),
    genres: [...genres.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id),
  };
}

function collectAvailabilityProviders(
  groups: Array<TmdbAvailabilityProvider[] | undefined>,
) {
  const providers = new Map<number, {
    id: number;
    name: string;
    logoPath: string | null;
    displayPriority: number;
  }>();

  for (const group of groups) {
    for (const entry of group ?? []) {
      const id = positiveInteger(entry.provider_id);
      const name = entry.provider_name?.trim();
      if (!id || !name) continue;
      const displayPriority = Number.isInteger(entry.display_priority) && (entry.display_priority ?? -1) >= 0
        ? entry.display_priority as number
        : 9_999;
      const existing = providers.get(id);
      if (existing && existing.displayPriority <= displayPriority) continue;
      providers.set(id, {
        id,
        name,
        logoPath: entry.logo_path?.trim() || null,
        displayPriority,
      });
    }
  }

  return providers;
}

/** Normalize all regional results from the one global TMDB/JustWatch response. */
export function mapTmdbAvailability(payload: TmdbWatchProviderPayload): CatalogAvailabilitySnapshot {
  const allProviders = new Map<number, { id: number; name: string; logoPath: string | null }>();
  const regions: CatalogAvailabilitySnapshot["regions"] = [];

  for (const [rawRegion, rawAvailability] of Object.entries(payload.results ?? {})) {
    const region = rawRegion.trim().toUpperCase();
    const availability = rawAvailability as TmdbRegionAvailability | undefined;
    if (!/^[A-Z]{2}$/.test(region) || !availability) continue;

    const streaming = collectAvailabilityProviders([
      availability.flatrate,
      availability.free,
      availability.ads,
    ]);
    const rentOrBuy = collectAvailabilityProviders([availability.rent, availability.buy]);
    for (const id of streaming.keys()) rentOrBuy.delete(id);

    const services = [
      ...[...streaming.values()].map((provider) => ({
        providerId: provider.id,
        accessType: "streaming" as const,
        displayPriority: provider.displayPriority,
      })),
      ...[...rentOrBuy.values()].map((provider) => ({
        providerId: provider.id,
        accessType: "rent_or_buy" as const,
        displayPriority: provider.displayPriority,
      })),
    ].sort((a, b) => a.displayPriority - b.displayPriority || a.providerId - b.providerId);

    for (const provider of [...streaming.values(), ...rentOrBuy.values()]) {
      allProviders.set(provider.id, {
        id: provider.id,
        name: provider.name,
        logoPath: provider.logoPath,
      });
    }

    regions.push({
      region,
      link: availability.link?.trim() || null,
      services,
    });
  }

  return {
    providers: [...allProviders.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id),
    regions: regions.sort((a, b) => a.region.localeCompare(b.region)),
  };
}

export async function upsertCatalogSearchResults(
  results: TmdbSearchResult[],
  now = new Date(),
) {
  if (results.length === 0) return;

  await db
    .insert(catalogTitles)
    .values(results.map((result) => ({
      id: catalogTitleId(result.mediaType, result.externalId),
      provider: "tmdb" as const,
      externalId: result.externalId,
      mediaType: result.mediaType,
      title: result.title,
      originalTitle: result.originalTitle,
      releaseYear: result.releaseYear,
      posterPath: result.posterPath,
      overview: result.overview,
      voteAverage: result.voteAverage,
      popularity: result.popularity,
      updatedAt: now,
    })))
    .onConflictDoUpdate({
      target: [catalogTitles.provider, catalogTitles.mediaType, catalogTitles.externalId],
      set: {
        title: sql`excluded.title`,
        originalTitle: sql`excluded.original_title`,
        releaseYear: sql`excluded.release_year`,
        posterPath: sql`excluded.poster_path`,
        overview: sql`excluded.overview`,
        voteAverage: sql`excluded.vote_average`,
        popularity: sql`excluded.popularity`,
        updatedAt: now,
      },
    });
}

async function ensureCatalogTitle(mediaType: CatalogMediaType, externalId: number) {
  const id = catalogTitleId(mediaType, externalId);
  const [existing] = await db
    .select({ id: catalogTitles.id })
    .from(catalogTitles)
    .where(eq(catalogTitles.id, id))
    .limit(1);
  if (existing) return id;

  const [item] = await db
    .select({
      title: mediaItems.title,
      originalTitle: mediaItems.originalTitle,
      releaseYear: mediaItems.releaseYear,
      posterPath: mediaItems.posterPath,
      overview: mediaItems.overview,
    })
    .from(mediaItems)
    .where(and(
      eq(mediaItems.provider, "tmdb"),
      eq(mediaItems.mediaType, mediaType),
      eq(mediaItems.externalId, externalId),
      ne(mediaItems.status, "removed"),
    ))
    .limit(1);
  if (!item) return null;

  await db
    .insert(catalogTitles)
    .values({ id, provider: "tmdb", externalId, mediaType, ...item })
    .onConflictDoNothing();
  return id;
}

export async function cacheCatalogAvailability(
  mediaType: WatchMediaType,
  tmdbId: number,
  payload: TmdbWatchProviderPayload,
  now = new Date(),
) {
  const titleId = await ensureCatalogTitle(mediaType, tmdbId);
  if (!titleId) return false;
  const snapshot = mapTmdbAvailability(payload);

  await db.transaction(async (transaction) => {
    if (snapshot.providers.length > 0) {
      await transaction
        .insert(streamingProviders)
        .values(snapshot.providers.map((provider) => ({ ...provider, updatedAt: now })))
        .onConflictDoUpdate({
          target: streamingProviders.id,
          set: {
            name: sql`excluded.name`,
            logoPath: sql`excluded.logo_path`,
            updatedAt: now,
          },
        });
    }

    await transaction
      .delete(catalogAvailabilityServices)
      .where(eq(catalogAvailabilityServices.catalogTitleId, titleId));
    await transaction
      .delete(catalogAvailability)
      .where(eq(catalogAvailability.catalogTitleId, titleId));

    if (snapshot.regions.length > 0) {
      await transaction.insert(catalogAvailability).values(
        snapshot.regions.map(({ link, region }) => ({ catalogTitleId: titleId, link, region })),
      );
      const services = snapshot.regions.flatMap((entry) => entry.services.map((service) => ({
        catalogTitleId: titleId,
        region: entry.region,
        ...service,
      })));
      if (services.length > 0) await transaction.insert(catalogAvailabilityServices).values(services);
    }

    await transaction
      .update(catalogTitles)
      .set({ availabilityRefreshedAt: now, updatedAt: now })
      .where(eq(catalogTitles.id, titleId));
  });

  return true;
}

export async function getCatalogWatchProviders(
  mediaType: WatchMediaType,
  tmdbId: number,
  region: string,
  now = new Date(),
): Promise<TitleWatchProviders | null> {
  const titleId = catalogTitleId(mediaType, tmdbId);
  const freshAfter = new Date(now.getTime() - CATALOG_AVAILABILITY_TTL_MS);
  const [title] = await db
    .select({ refreshedAt: catalogTitles.availabilityRefreshedAt })
    .from(catalogTitles)
    .where(and(
      eq(catalogTitles.id, titleId),
      gt(catalogTitles.availabilityRefreshedAt, freshAfter),
    ))
    .limit(1);
  if (!title) return null;

  const normalizedRegion = region.trim().toUpperCase();
  const [regional, services] = await Promise.all([
    db
      .select({ link: catalogAvailability.link })
      .from(catalogAvailability)
      .where(and(
        eq(catalogAvailability.catalogTitleId, titleId),
        eq(catalogAvailability.region, normalizedRegion),
      ))
      .limit(1),
    db
      .select({
        id: streamingProviders.id,
        name: streamingProviders.name,
        logoPath: streamingProviders.logoPath,
        accessType: catalogAvailabilityServices.accessType,
      })
      .from(catalogAvailabilityServices)
      .innerJoin(streamingProviders, eq(streamingProviders.id, catalogAvailabilityServices.providerId))
      .where(and(
        eq(catalogAvailabilityServices.catalogTitleId, titleId),
        eq(catalogAvailabilityServices.region, normalizedRegion),
      ))
      .orderBy(
        asc(catalogAvailabilityServices.displayPriority),
        asc(streamingProviders.name),
      ),
  ]);

  const mapped = services.map((service) => ({
    id: service.id,
    name: service.name,
    logoPath: service.logoPath,
  }));

  return {
    region: normalizedRegion,
    link: regional[0]?.link ?? null,
    streaming: mapped.filter((_provider, index) => services[index].accessType === "streaming"),
    rentOrBuy: mapped.filter((_provider, index) => services[index].accessType === "rent_or_buy"),
  };
}

export async function persistCatalogTitleMetadata(
  metadata: CatalogTitleMetadata,
  now = new Date(),
) {
  const { genres, ...title } = metadata;
  await db.transaction(async (transaction) => {
    await transaction
      .insert(catalogTitles)
      .values({ ...title, metadataRefreshedAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: [catalogTitles.provider, catalogTitles.mediaType, catalogTitles.externalId],
        set: {
          title: metadata.title,
          originalTitle: metadata.originalTitle,
          releaseDate: metadata.releaseDate,
          releaseYear: metadata.releaseYear,
          posterPath: metadata.posterPath,
          overview: metadata.overview,
          runtimeMinutes: metadata.runtimeMinutes,
          voteAverage: metadata.voteAverage,
          voteCount: metadata.voteCount,
          popularity: metadata.popularity,
          metadataRefreshedAt: now,
          updatedAt: now,
        },
      });
    await transaction.delete(catalogTitleGenres).where(eq(catalogTitleGenres.catalogTitleId, metadata.id));
    if (genres.length > 0) {
      await transaction.insert(catalogTitleGenres).values(genres.map((genre) => ({
        catalogTitleId: metadata.id,
        genreId: genre.id,
        name: genre.name,
      })));
    }
  });
}
