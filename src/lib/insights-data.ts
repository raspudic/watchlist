import "server-only";

import { and, asc, eq, inArray, ne } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { catalogTitleGenres, catalogTitles, mediaItems, watchEvents } from "@/lib/db/schema";
import type { InsightsEvent, InsightsMediaType } from "@/lib/insights";

/**
 * Every viewing this account has recorded, with the title behind it. The
 * catalog is joined loosely on purpose: a custom title, or one the catalog has
 * never seen, still counts as something watched.
 *
 * A removed title is gone everywhere else — the library, the watchlist, the
 * catalog refresh — so its viewings do not count here either. The rows survive
 * the soft delete; the statistics should not.
 */
export async function listInsightsEvents(userId: string): Promise<InsightsEvent[]> {
  const rows = await db
    .select({
      id: watchEvents.id,
      mediaItemId: watchEvents.mediaItemId,
      watchedOn: watchEvents.watchedOn,
      rating: watchEvents.rating,
      title: mediaItems.title,
      mediaType: mediaItems.mediaType,
      posterPath: mediaItems.posterPath,
      catalogTitleId: catalogTitles.id,
      runtimeMinutes: catalogTitles.runtimeMinutes,
    })
    .from(watchEvents)
    .innerJoin(mediaItems, eq(mediaItems.id, watchEvents.mediaItemId))
    .leftJoin(
      catalogTitles,
      and(
        eq(catalogTitles.provider, mediaItems.provider),
        eq(catalogTitles.mediaType, mediaItems.mediaType),
        eq(catalogTitles.externalId, mediaItems.externalId),
      ),
    )
    .where(and(
      eq(watchEvents.userId, userId),
      ne(mediaItems.status, "removed"),
    ))
    .orderBy(asc(watchEvents.watchedOn), asc(watchEvents.id));

  const catalogIds = [...new Set(rows.map((row) => row.catalogTitleId).filter((id): id is string => Boolean(id)))];
  const genreRows = catalogIds.length > 0
    ? await db
      .select({ catalogTitleId: catalogTitleGenres.catalogTitleId, name: catalogTitleGenres.name })
      .from(catalogTitleGenres)
      .where(inArray(catalogTitleGenres.catalogTitleId, catalogIds))
      .orderBy(asc(catalogTitleGenres.name))
    : [];

  const genres = new Map<string, string[]>();
  for (const row of genreRows) {
    genres.set(row.catalogTitleId, [...(genres.get(row.catalogTitleId) ?? []), row.name]);
  }

  return rows.map((row) => ({
    id: row.id,
    mediaItemId: row.mediaItemId,
    watchedOn: row.watchedOn,
    rating: row.rating,
    title: row.title,
    mediaType: row.mediaType as InsightsMediaType,
    posterPath: row.posterPath,
    /* A series runtime is one episode, so it is deliberately dropped here. */
    runtimeMinutes: row.mediaType === "movie" ? row.runtimeMinutes : null,
    genres: row.catalogTitleId ? genres.get(row.catalogTitleId) ?? [] : [],
  }));
}
