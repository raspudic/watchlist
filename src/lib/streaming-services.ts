import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  streamingProviderRegions,
  streamingProviders,
  userStreamingServices,
} from "@/lib/db/schema";
import { tmdbFetch } from "@/lib/tmdb-client";

export type StreamingMediaType = "movie" | "tv";

export type StreamingService = {
  id: number;
  name: string;
  logoPath: string | null;
  mediaTypes: StreamingMediaType[];
};

type TmdbDirectoryProvider = {
  provider_id?: number;
  provider_name?: string;
  logo_path?: string | null;
  display_priority?: number;
  display_priorities?: Record<string, number | undefined>;
};

export type TmdbProviderDirectoryPayload = {
  results?: TmdbDirectoryProvider[];
};

export type ProviderDirectory = {
  providers: Array<{ id: number; name: string; logoPath: string | null }>;
  regions: Array<{
    providerId: number;
    region: string;
    mediaType: StreamingMediaType;
    displayPriority: number;
  }>;
};

function isRegion(value: string) {
  return /^[A-Z]{2}$/.test(value);
}

/** Normalize the global movie and television provider lists into one directory. */
export function mapTmdbProviderDirectory(
  payloads: Record<StreamingMediaType, TmdbProviderDirectoryPayload>,
): ProviderDirectory {
  const providers = new Map<number, { id: number; name: string; logoPath: string | null }>();
  const regions = new Map<string, ProviderDirectory["regions"][number]>();

  for (const mediaType of ["movie", "tv"] as const) {
    for (const entry of payloads[mediaType].results ?? []) {
      const id = entry.provider_id;
      const name = entry.provider_name?.trim();
      if (!Number.isInteger(id) || (id ?? 0) <= 0 || !name) continue;

      const providerId = id as number;
      providers.set(providerId, {
        id: providerId,
        name,
        logoPath: entry.logo_path?.trim() || null,
      });

      for (const [rawRegion, rawPriority] of Object.entries(entry.display_priorities ?? {})) {
        const region = rawRegion.trim().toUpperCase();
        if (!isRegion(region)) continue;
        const displayPriority = Number.isInteger(rawPriority) && (rawPriority ?? -1) >= 0
          ? rawPriority as number
          : Number.isInteger(entry.display_priority) && (entry.display_priority ?? -1) >= 0
            ? entry.display_priority as number
            : 9_999;
        regions.set(`${providerId}:${region}:${mediaType}`, {
          providerId,
          region,
          mediaType,
          displayPriority,
        });
      }
    }
  }

  return {
    providers: [...providers.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id),
    regions: [...regions.values()].sort((a, b) =>
      a.region.localeCompare(b.region)
      || a.displayPriority - b.displayPriority
      || a.providerId - b.providerId
      || a.mediaType.localeCompare(b.mediaType)),
  };
}

export class StreamingProviderRefreshError extends Error {
  constructor(public readonly kind: "unconfigured" | "rate_limited" | "error") {
    super("The streaming service directory could not be refreshed.");
    this.name = "StreamingProviderRefreshError";
  }
}

export async function persistStreamingProviderDirectory(
  directory: ProviderDirectory,
  now = new Date(),
) {
  await db.transaction(async (transaction) => {
    if (directory.providers.length > 0) {
      await transaction
        .insert(streamingProviders)
        .values(directory.providers.map((provider) => ({ ...provider, updatedAt: now })))
        .onConflictDoUpdate({
          target: streamingProviders.id,
          set: {
            name: sql`excluded.name`,
            logoPath: sql`excluded.logo_path`,
            updatedAt: now,
          },
        });
    }

    await transaction.delete(streamingProviderRegions);
    if (directory.regions.length > 0) {
      await transaction.insert(streamingProviderRegions).values(
        directory.regions.map((entry) => ({ ...entry, updatedAt: now })),
      );
    }
  });

  return { providers: directory.providers.length, regions: directory.regions.length };
}

export async function refreshStreamingProviderDirectory(
  fetcher: typeof tmdbFetch = tmdbFetch,
  now = new Date(),
) {
  const [movie, tv] = await Promise.all([
    fetcher<TmdbProviderDirectoryPayload>("/watch/providers/movie", { language: "en-US" }),
    fetcher<TmdbProviderDirectoryPayload>("/watch/providers/tv", { language: "en-US" }),
  ]);

  if (!movie.ok) throw new StreamingProviderRefreshError(movie.kind);
  if (!tv.ok) throw new StreamingProviderRefreshError(tv.kind);

  return persistStreamingProviderDirectory(mapTmdbProviderDirectory({ movie: movie.data, tv: tv.data }), now);
}

export async function listStreamingServicesForRegion(region: string): Promise<StreamingService[]> {
  const normalizedRegion = region.trim().toUpperCase();
  const rows = await db
    .select({
      id: streamingProviders.id,
      name: streamingProviders.name,
      logoPath: streamingProviders.logoPath,
      mediaType: streamingProviderRegions.mediaType,
      displayPriority: streamingProviderRegions.displayPriority,
    })
    .from(streamingProviderRegions)
    .innerJoin(streamingProviders, eq(streamingProviders.id, streamingProviderRegions.providerId))
    .where(eq(streamingProviderRegions.region, normalizedRegion))
    .orderBy(asc(streamingProviderRegions.displayPriority), asc(streamingProviders.name));

  const services = new Map<number, StreamingService & { displayPriority: number }>();
  for (const row of rows) {
    if (row.mediaType !== "movie" && row.mediaType !== "tv") continue;
    const existing = services.get(row.id);
    if (existing) {
      if (!existing.mediaTypes.includes(row.mediaType)) existing.mediaTypes.push(row.mediaType);
      existing.displayPriority = Math.min(existing.displayPriority, row.displayPriority);
      continue;
    }
    services.set(row.id, {
      id: row.id,
      name: row.name,
      logoPath: row.logoPath,
      mediaTypes: [row.mediaType],
      displayPriority: row.displayPriority,
    });
  }

  return [...services.values()]
    .sort((a, b) => a.displayPriority - b.displayPriority || a.name.localeCompare(b.name))
    .map((service) => ({
      id: service.id,
      name: service.name,
      logoPath: service.logoPath,
      mediaTypes: service.mediaTypes,
    }));
}

export async function getUserStreamingServiceIds(userId: string, region: string): Promise<number[]> {
  const normalizedRegion = region.trim().toUpperCase();
  const rows = await db
    .selectDistinct({ providerId: userStreamingServices.providerId })
    .from(userStreamingServices)
    .innerJoin(
      streamingProviderRegions,
      eq(streamingProviderRegions.providerId, userStreamingServices.providerId),
    )
    .where(and(
      eq(userStreamingServices.userId, userId),
      eq(streamingProviderRegions.region, normalizedRegion),
    ));

  return rows.map((row) => row.providerId).sort((a, b) => a - b);
}

export class UnknownStreamingServiceError extends Error {
  constructor() {
    super("Choose services available in your selected country.");
    this.name = "UnknownStreamingServiceError";
  }
}

export async function replaceUserStreamingServices(
  userId: string,
  region: string,
  providerIds: number[],
): Promise<number[]> {
  const normalizedRegion = region.trim().toUpperCase();
  const uniqueIds = [...new Set(providerIds)].sort((a, b) => a - b);

  if (uniqueIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new UnknownStreamingServiceError();
  }

  if (uniqueIds.length > 0) {
    const validRows = await db
      .selectDistinct({ providerId: streamingProviderRegions.providerId })
      .from(streamingProviderRegions)
      .where(and(
        eq(streamingProviderRegions.region, normalizedRegion),
        inArray(streamingProviderRegions.providerId, uniqueIds),
      ));
    if (new Set(validRows.map((row) => row.providerId)).size !== uniqueIds.length) {
      throw new UnknownStreamingServiceError();
    }
  }

  await db.transaction(async (transaction) => {
    await transaction.delete(userStreamingServices).where(eq(userStreamingServices.userId, userId));
    if (uniqueIds.length > 0) {
      await transaction.insert(userStreamingServices).values(
        uniqueIds.map((providerId) => ({ userId, providerId })),
      );
    }
  });

  return uniqueIds;
}
