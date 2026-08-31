import "server-only";

import { and, eq, gt } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { tmdbWatchProviderCache } from "@/lib/db/schema";

/**
 * The shared cache of TMDB answers: one table, namespaced keys. Availability
 * sits beside the country list and a title's ids on other services, because
 * each is a slow-moving public fact with nothing user-specific in it. Every
 * row carries its own TTL and the lifecycle sweep drops it once stale.
 */
export async function readTmdbCache<T>(key: string, now: Date) {
  const [entry] = await db
    .select({ payload: tmdbWatchProviderCache.payload })
    .from(tmdbWatchProviderCache)
    .where(and(eq(tmdbWatchProviderCache.key, key), gt(tmdbWatchProviderCache.expiresAt, now)))
    .limit(1);

  if (!entry) return null;

  try {
    return JSON.parse(entry.payload) as T;
  } catch {
    await db.delete(tmdbWatchProviderCache).where(eq(tmdbWatchProviderCache.key, key));
    return null;
  }
}

export async function writeTmdbCache(key: string, value: unknown, ttlMs: number, now: number) {
  const payload = JSON.stringify(value);
  const expiresAt = new Date(now + ttlMs);

  await db
    .insert(tmdbWatchProviderCache)
    .values({ key, payload, expiresAt })
    .onConflictDoUpdate({
      target: tmdbWatchProviderCache.key,
      set: { payload, expiresAt },
    });
}
