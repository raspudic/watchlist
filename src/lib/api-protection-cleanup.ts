import "server-only";

import { lt } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { apiRateLimitBuckets, tmdbSearchCache } from "@/lib/db/schema";

export async function cleanupApiProtectionData(now = new Date()) {
  const [rateLimits, cacheEntries] = await Promise.all([
    db.delete(apiRateLimitBuckets).where(lt(apiRateLimitBuckets.expiresAt, now)).returning({ key: apiRateLimitBuckets.key }),
    db.delete(tmdbSearchCache).where(lt(tmdbSearchCache.expiresAt, now)).returning({ key: tmdbSearchCache.key }),
  ]);

  return { rateLimitBuckets: rateLimits.length, tmdbCacheEntries: cacheEntries.length };
}
