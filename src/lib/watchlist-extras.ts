import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  catalogAvailabilityServices,
  catalogTitleGenres,
  catalogTitles,
  mediaItems,
  streamingProviders,
} from "@/lib/db/schema";
import { streamingServiceIdentity } from "@/lib/streaming-service-brand";
import type { TitleExtras, TonightGenre, TonightProvider } from "@/lib/tonight";

/**
 * What the shared catalog knows about the account's watchlist, keyed by media
 * item id. The library rows themselves come from /api/items, so this is purely
 * the layer on top: genres, runtime, score and where each title streams.
 *
 * The catalog is joined on the provider identity rather than a foreign key, so
 * a title it has never seen simply has no entry here.
 */
export async function listWatchlistExtras(
  userId: string,
  regions: string[],
): Promise<TitleExtras[]> {
  const rows = await db
    .select({
      mediaItemId: mediaItems.id,
      catalogTitleId: catalogTitles.id,
      runtimeMinutes: catalogTitles.runtimeMinutes,
      voteAverage: catalogTitles.voteAverage,
      voteCount: catalogTitles.voteCount,
      releaseDate: catalogTitles.releaseDate,
      availabilityRefreshedAt: catalogTitles.availabilityRefreshedAt,
    })
    .from(mediaItems)
    /* Deliberately joined on the provider identity rather than a foreign key:
       the catalog is shared, and a library row must keep working without it. */
    .leftJoin(
      catalogTitles,
      and(
        eq(catalogTitles.provider, mediaItems.provider),
        eq(catalogTitles.mediaType, mediaItems.mediaType),
        eq(catalogTitles.externalId, mediaItems.externalId),
      ),
    )
    .where(and(eq(mediaItems.userId, userId), eq(mediaItems.status, "watchlist")));

  const catalogIds = [...new Set(rows.map((row) => row.catalogTitleId).filter((id): id is string => Boolean(id)))];

  const [genreRows, serviceRows] = await Promise.all([
    catalogIds.length > 0
      ? db
        .select({
          catalogTitleId: catalogTitleGenres.catalogTitleId,
          id: catalogTitleGenres.genreId,
          name: catalogTitleGenres.name,
        })
        .from(catalogTitleGenres)
        .where(inArray(catalogTitleGenres.catalogTitleId, catalogIds))
        .orderBy(asc(catalogTitleGenres.name))
      : Promise.resolve([]),
    catalogIds.length > 0 && regions.length > 0
      ? db
        .select({
          catalogTitleId: catalogAvailabilityServices.catalogTitleId,
          region: catalogAvailabilityServices.region,
          id: streamingProviders.id,
          name: streamingProviders.name,
          logoPath: streamingProviders.logoPath,
        })
        .from(catalogAvailabilityServices)
        .innerJoin(
          streamingProviders,
          eq(streamingProviders.id, catalogAvailabilityServices.providerId),
        )
        .where(and(
          inArray(catalogAvailabilityServices.catalogTitleId, catalogIds),
          inArray(catalogAvailabilityServices.region, regions),
          /* Rent and buy are not what "what can I watch tonight" means. */
          eq(catalogAvailabilityServices.accessType, "streaming"),
        ))
        .orderBy(
          asc(catalogAvailabilityServices.displayPriority),
          asc(streamingProviders.name),
        )
      : Promise.resolve([]),
  ]);

  const genres = new Map<string, TonightGenre[]>();
  for (const row of genreRows) {
    const list = genres.get(row.catalogTitleId) ?? [];
    list.push({ id: row.id, name: row.name });
    genres.set(row.catalogTitleId, list);
  }

  /* One entry per consumer service per title, carrying the countries it
     streams in. TMDB may use multiple provider ids for the same brand. */
  const streaming = new Map<string, TonightProvider[]>();
  for (const row of serviceRows) {
    const list = streaming.get(row.catalogTitleId) ?? [];
    const identity = streamingServiceIdentity(row.name);
    const existing = list.find((provider) => streamingServiceIdentity(provider.name).key === identity.key);
    if (existing) {
      if (!existing.regions.includes(row.region)) existing.regions.push(row.region);
      continue;
    }
    list.push({ id: row.id, name: identity.name, logoPath: row.logoPath, regions: [row.region] });
    streaming.set(row.catalogTitleId, list);
  }

  for (const list of streaming.values()) {
    for (const provider of list) {
      provider.regions = regions.filter((region) => provider.regions.includes(region));
    }
  }

  return rows.map((row): TitleExtras => ({
    mediaItemId: row.mediaItemId,
    genres: row.catalogTitleId ? genres.get(row.catalogTitleId) ?? [] : [],
    runtimeMinutes: row.runtimeMinutes,
    voteAverage: row.voteAverage,
    voteCount: row.voteCount,
    releaseDate: row.releaseDate,
    streaming: row.catalogTitleId ? streaming.get(row.catalogTitleId) ?? [] : [],
    /* Null means the catalog has never looked this title up, which the page
       says out loud rather than presenting as "not available". */
    availabilityCheckedAt: row.availabilityRefreshedAt?.toISOString() ?? null,
  }));
}
