import "server-only";

import { and, asc, eq, inArray, notInArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  streamingProviderRegions,
  user,
  userRegions,
  userStreamingServices,
} from "@/lib/db/schema";
import { isRegionCode } from "@/lib/region";

/** The account's countries, home first. */
export async function listUserRegions(userId: string): Promise<string[]> {
  const rows = await db
    .select({ region: userRegions.region })
    .from(userRegions)
    .where(eq(userRegions.userId, userId))
    .orderBy(asc(userRegions.position), asc(userRegions.region));

  return rows.map((row) => row.region).filter(isRegionCode);
}

/**
 * Saves the whole list in the order given. `user.region` mirrors the first one,
 * and services no country carries any more are dropped: leaving them would keep
 * invisible picks that reappear if the country is ever added back.
 */
export async function replaceUserRegions(userId: string, regions: string[]): Promise<string[]> {
  await db.transaction(async (transaction) => {
    await transaction.delete(userRegions).where(eq(userRegions.userId, userId));

    if (regions.length > 0) {
      await transaction
        .insert(userRegions)
        .values(regions.map((region, position) => ({ userId, region, position })));
    }

    await transaction
      .update(user)
      .set({ region: regions[0] ?? null, updatedAt: new Date() })
      .where(eq(user.id, userId));

    const carried = regions.length === 0
      ? []
      : await transaction
        .selectDistinct({ providerId: streamingProviderRegions.providerId })
        .from(streamingProviderRegions)
        .where(inArray(streamingProviderRegions.region, regions));
    const providerIds = carried.map((row) => row.providerId);

    await transaction.delete(userStreamingServices).where(
      providerIds.length === 0
        ? eq(userStreamingServices.userId, userId)
        : and(
          eq(userStreamingServices.userId, userId),
          notInArray(userStreamingServices.providerId, providerIds),
        ),
    );
  });

  return regions;
}
