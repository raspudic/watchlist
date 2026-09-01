import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  catalogAvailabilityServices,
  catalogTitleGenres,
  catalogTitles,
  mediaItems,
  streamingProviders,
} from "@/lib/db/schema";
import type { MediaItem } from "@/lib/library-cache";
import type { TonightCandidate, TonightGenre, TonightProvider } from "@/lib/tonight";

/**
 * Every watchlist title with whatever the shared catalog knows about it. The
 * catalog is joined on the provider identity rather than a foreign key, so a
 * library row the catalog has never seen still comes back, just barer.
 */
export async function listTonightCandidates(
  userId: string,
  regions: string[],
): Promise<TonightCandidate[]> {
  const rows = await db
    .select({
      item: mediaItems,
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
    .where(and(eq(mediaItems.userId, userId), eq(mediaItems.status, "watchlist")))
    .orderBy(desc(mediaItems.addedAt));

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

  /* One entry per service per title, carrying the countries it streams in, so
     a chip can say "Max, in SE" without repeating the service. */
  const streaming = new Map<string, TonightProvider[]>();
  for (const row of serviceRows) {
    const list = streaming.get(row.catalogTitleId) ?? [];
    const existing = list.find((provider) => provider.id === row.id);
    if (existing) {
      if (!existing.regions.includes(row.region)) existing.regions.push(row.region);
      continue;
    }
    list.push({ id: row.id, name: row.name, logoPath: row.logoPath, regions: [row.region] });
    streaming.set(row.catalogTitleId, list);
  }

  for (const list of streaming.values()) {
    for (const provider of list) {
      provider.regions = regions.filter((region) => provider.regions.includes(region));
    }
  }

  const candidates = rows.map((row): TonightCandidate => ({
    item: {
      ...row.item,
      mediaType: row.item.mediaType as MediaItem["mediaType"],
      status: row.item.status as MediaItem["status"],
      addedAt: row.item.addedAt.toISOString(),
      watchedAt: row.item.watchedAt?.toISOString() ?? null,
      pinnedAt: row.item.pinnedAt?.toISOString() ?? null,
    },
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

  return candidates;
}
