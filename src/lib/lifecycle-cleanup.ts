import { and, isNotNull, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  apiRateLimitBuckets,
  invitations,
  rateLimit,
  session,
  tmdbSearchCache,
  tmdbWatchProviderCache,
  verification,
} from "@/lib/db/schema";
import { lifecycleCutoffs } from "@/lib/lifecycle-policy";

const LIFECYCLE_CLEANUP_LOCK_ID = 2_026_08_20;

export async function runLifecycleCleanup(now = new Date()) {
  return db.transaction(async (transaction) => {
    const lockResult = await transaction.execute<{ acquired: boolean }>(
      sql`SELECT pg_try_advisory_xact_lock(${LIFECYCLE_CLEANUP_LOCK_ID}) AS acquired`,
    );

    if (!lockResult[0]?.acquired) return null;

    const cutoffs = lifecycleCutoffs(now);
    const deletedSessions = await transaction
      .delete(session)
      .where(lt(session.expiresAt, now))
      .returning({ id: session.id });
    const deletedVerifications = await transaction
      .delete(verification)
      .where(lt(verification.expiresAt, now))
      .returning({ id: verification.id });
    const deletedRateLimits = await transaction
      .delete(rateLimit)
      .where(lt(rateLimit.lastRequest, cutoffs.rateLimit))
      .returning({ id: rateLimit.id });
    const deletedInvitations = await transaction
      .delete(invitations)
      .where(or(
        and(
          isNotNull(invitations.acceptedAt),
          lt(invitations.acceptedAt, cutoffs.terminalInvitation),
        ),
        and(
          isNotNull(invitations.revokedAt),
          lt(invitations.revokedAt, cutoffs.terminalInvitation),
        ),
        and(
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          lt(invitations.expiresAt, cutoffs.terminalInvitation),
        ),
      ))
      .returning({ id: invitations.id });
    const deletedApiRateLimitBuckets = await transaction
      .delete(apiRateLimitBuckets)
      .where(lt(apiRateLimitBuckets.expiresAt, now))
      .returning({ key: apiRateLimitBuckets.key });
    const deletedTmdbCacheEntries = await transaction
      .delete(tmdbSearchCache)
      .where(lt(tmdbSearchCache.expiresAt, now))
      .returning({ key: tmdbSearchCache.key });
    const deletedWatchProviderCacheEntries = await transaction
      .delete(tmdbWatchProviderCache)
      .where(lt(tmdbWatchProviderCache.expiresAt, now))
      .returning({ key: tmdbWatchProviderCache.key });

    return {
      apiRateLimitBuckets: deletedApiRateLimitBuckets.length,
      invitations: deletedInvitations.length,
      rateLimits: deletedRateLimits.length,
      sessions: deletedSessions.length,
      tmdbCacheEntries: deletedTmdbCacheEntries.length,
      verifications: deletedVerifications.length,
      watchProviderCacheEntries: deletedWatchProviderCacheEntries.length,
    };
  });
}
