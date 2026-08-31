import "server-only";

import { and, asc, eq, isNull, lt, ne, or } from "drizzle-orm";

import {
  CATALOG_AVAILABILITY_TTL_MS,
  CATALOG_METADATA_TTL_MS,
  cacheCatalogAvailability,
  catalogTitleId,
  mapTmdbTitleDetails,
  persistCatalogTitleMetadata,
  type CatalogMediaType,
  type TmdbTitleDetailsPayload,
} from "@/lib/catalog";
import { db } from "@/lib/db/client";
import { catalogTitles, mediaItems } from "@/lib/db/schema";
import {
  refreshStreamingProviderDirectory,
  StreamingProviderRefreshError,
} from "@/lib/streaming-services";
import { tmdbFetch } from "@/lib/tmdb-client";
import type { TmdbWatchProviderPayload } from "@/lib/watch-providers";

const CATALOG_REFRESH_LOCK_ID = 2_026_09_01;
export const CATALOG_REFRESH_BATCH_SIZE = 100;

type CatalogFetcher = typeof tmdbFetch;

export type CatalogRefreshResult = {
  seededTitles: number;
  selectedTitles: number;
  metadataRefreshed: number;
  metadataFailed: number;
  availabilityRefreshed: number;
  availabilityFailed: number;
  directoryProviders: number;
  directoryRegions: number;
  directoryFailed: boolean;
};

function isCatalogMediaType(value: string): value is CatalogMediaType {
  return value === "movie" || value === "tv";
}

export async function seedCatalogTitlesFromLibrary(now = new Date()) {
  const rows = await db
    .select({
      externalId: mediaItems.externalId,
      mediaType: mediaItems.mediaType,
      title: mediaItems.title,
      originalTitle: mediaItems.originalTitle,
      releaseYear: mediaItems.releaseYear,
      posterPath: mediaItems.posterPath,
      overview: mediaItems.overview,
    })
    .from(mediaItems)
    .where(and(
      eq(mediaItems.provider, "tmdb"),
      ne(mediaItems.status, "removed"),
    ));

  const unique = new Map<string, typeof rows[number] & {
    externalId: number;
    mediaType: CatalogMediaType;
  }>();
  for (const row of rows) {
    if (!row.externalId || !isCatalogMediaType(row.mediaType)) continue;
    const id = catalogTitleId(row.mediaType, row.externalId);
    if (!unique.has(id)) unique.set(id, { ...row, externalId: row.externalId, mediaType: row.mediaType });
  }

  let inserted = 0;
  for (const [id, row] of unique) {
    const result = await db
      .insert(catalogTitles)
      .values({
        id,
        provider: "tmdb",
        externalId: row.externalId,
        mediaType: row.mediaType,
        title: row.title,
        originalTitle: row.originalTitle,
        releaseYear: row.releaseYear,
        posterPath: row.posterPath,
        overview: row.overview,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: catalogTitles.id });
    inserted += result.length;
  }

  return inserted;
}

async function selectTitlesForRefresh(now: Date, limit: number) {
  const metadataCutoff = new Date(now.getTime() - CATALOG_METADATA_TTL_MS);
  const availabilityCutoff = new Date(now.getTime() - CATALOG_AVAILABILITY_TTL_MS);
  return db
    .select({
      id: catalogTitles.id,
      externalId: catalogTitles.externalId,
      mediaType: catalogTitles.mediaType,
      metadataRefreshedAt: catalogTitles.metadataRefreshedAt,
      availabilityRefreshedAt: catalogTitles.availabilityRefreshedAt,
    })
    .from(catalogTitles)
    .where(or(
      isNull(catalogTitles.metadataRefreshedAt),
      lt(catalogTitles.metadataRefreshedAt, metadataCutoff),
      isNull(catalogTitles.availabilityRefreshedAt),
      lt(catalogTitles.availabilityRefreshedAt, availabilityCutoff),
    ))
    .orderBy(
      asc(catalogTitles.metadataRefreshedAt),
      asc(catalogTitles.availabilityRefreshedAt),
      asc(catalogTitles.createdAt),
    )
    .limit(limit);
}

function needsRefresh(refreshedAt: Date | null, cutoff: Date) {
  return !refreshedAt || refreshedAt < cutoff;
}

/**
 * Refreshes one bounded batch. A reserved PostgreSQL connection holds the
 * advisory lock while ordinary Drizzle queries use the pool; this avoids one
 * long transaction without allowing overlapping cron runs.
 */
export async function runCatalogRefresh(
  now = new Date(),
  limit = CATALOG_REFRESH_BATCH_SIZE,
  fetcher: CatalogFetcher = tmdbFetch,
): Promise<CatalogRefreshResult | null> {
  const connection = await db.$client.reserve();
  const [lock] = await connection<{ acquired: boolean }[]>`
    SELECT pg_try_advisory_lock(${CATALOG_REFRESH_LOCK_ID}) AS acquired
  `;
  if (!lock?.acquired) {
    connection.release();
    return null;
  }

  try {
    let directoryProviders = 0;
    let directoryRegions = 0;
    let directoryFailed = false;
    try {
      const directory = await refreshStreamingProviderDirectory(fetcher, now);
      directoryProviders = directory.providers;
      directoryRegions = directory.regions;
    } catch (error) {
      directoryFailed = true;
      if (!(error instanceof StreamingProviderRefreshError)) throw error;
    }

    const seededTitles = await seedCatalogTitlesFromLibrary(now);
    const titles = await selectTitlesForRefresh(now, Math.max(1, Math.min(limit, 500)));
    const metadataCutoff = new Date(now.getTime() - CATALOG_METADATA_TTL_MS);
    const availabilityCutoff = new Date(now.getTime() - CATALOG_AVAILABILITY_TTL_MS);
    let metadataRefreshed = 0;
    let metadataFailed = 0;
    let availabilityRefreshed = 0;
    let availabilityFailed = 0;
    let upstreamLimited = false;

    for (const title of titles) {
      if (upstreamLimited || !isCatalogMediaType(title.mediaType)) break;

      if (needsRefresh(title.metadataRefreshedAt, metadataCutoff)) {
        const response = await fetcher<TmdbTitleDetailsPayload>(
          `/${title.mediaType}/${title.externalId}`,
          { language: "en-US" },
        );
        if (response.ok) {
          const metadata = mapTmdbTitleDetails(title.mediaType, response.data);
          if (metadata) {
            await persistCatalogTitleMetadata(metadata, now);
            metadataRefreshed += 1;
          } else {
            metadataFailed += 1;
          }
        } else {
          metadataFailed += 1;
          upstreamLimited = response.kind === "rate_limited";
        }
      }

      if (!upstreamLimited && needsRefresh(title.availabilityRefreshedAt, availabilityCutoff)) {
        const response = await fetcher<TmdbWatchProviderPayload>(
          `/${title.mediaType}/${title.externalId}/watch/providers`,
        );
        if (response.ok) {
          await cacheCatalogAvailability(title.mediaType, title.externalId, response.data, now);
          availabilityRefreshed += 1;
        } else {
          availabilityFailed += 1;
          upstreamLimited = response.kind === "rate_limited";
        }
      }
    }

    return {
      seededTitles,
      selectedTitles: titles.length,
      metadataRefreshed,
      metadataFailed,
      availabilityRefreshed,
      availabilityFailed,
      directoryProviders,
      directoryRegions,
      directoryFailed,
    };
  } finally {
    await connection`SELECT pg_advisory_unlock(${CATALOG_REFRESH_LOCK_ID})`;
    connection.release();
  }
}
