import "server-only";

import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { apiRateLimitBuckets } from "@/lib/db/schema";
import { logOperationalEvent } from "@/lib/operational-events";

export type RateLimitReason =
  | "account_read"
  | "account_write"
  | "tmdb_account_burst"
  | "tmdb_account_minute"
  | "tmdb_application"
  | "tmdb_upstream";

export type RateLimitRule = {
  id: string;
  limit: number;
  windowSeconds: number;
  reason: RateLimitReason;
};

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; reason: RateLimitReason; retryAfter: number };

export interface RateLimitStore {
  increment(key: string, expiresAt: Date): Promise<number>;
}

const databaseStore: RateLimitStore = {
  async increment(key, expiresAt) {
    const [row] = await db
      .insert(apiRateLimitBuckets)
      .values({ key, count: 1, expiresAt })
      .onConflictDoUpdate({
        target: apiRateLimitBuckets.key,
        set: { count: sql`${apiRateLimitBuckets.count} + 1` },
      })
      .returning({ count: apiRateLimitBuckets.count });

    return row.count;
  },
};

export const API_RATE_LIMITS = {
  libraryRead: [
    { id: "library-read-burst", limit: 30, windowSeconds: 10, reason: "account_read" },
    { id: "library-read-minute", limit: 120, windowSeconds: 60, reason: "account_read" },
  ],
  libraryWrite: [
    { id: "library-write-burst", limit: 15, windowSeconds: 10, reason: "account_write" },
    { id: "library-write-minute", limit: 60, windowSeconds: 60, reason: "account_write" },
  ],
  tmdbAccount: [
    { id: "tmdb-account-burst", limit: 10, windowSeconds: 10, reason: "tmdb_account_burst" },
    { id: "tmdb-account-minute", limit: 30, windowSeconds: 60, reason: "tmdb_account_minute" },
  ],
  // Opening a detail sheet must not eat the search budget, so watch providers
  // get their own account tier while still sharing the upstream application one.
  tmdbWatchProviders: [
    { id: "tmdb-providers-burst", limit: 20, windowSeconds: 10, reason: "tmdb_account_burst" },
    { id: "tmdb-providers-minute", limit: 60, windowSeconds: 60, reason: "tmdb_account_minute" },
  ],
  tmdbApplication: [
    { id: "tmdb-application-burst", limit: 12, windowSeconds: 0.5, reason: "tmdb_application" },
    { id: "tmdb-application", limit: 30, windowSeconds: 1, reason: "tmdb_application" },
  ],
} satisfies Record<string, RateLimitRule[]>;

function opaqueScope(scope: string) {
  return createHash("sha256").update(scope).digest("base64url").slice(0, 22);
}

export async function consumeRateLimits(
  scope: string,
  rules: readonly RateLimitRule[],
  options: { now?: number; store?: RateLimitStore } = {},
): Promise<RateLimitDecision> {
  const now = options.now ?? Date.now();
  const store = options.store ?? databaseStore;
  const safeScope = opaqueScope(scope);

  for (const rule of rules) {
    const windowMs = rule.windowSeconds * 1000;
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const expiresAtMs = windowStart + windowMs;
    const count = await store.increment(
      `${rule.id}:${safeScope}:${windowStart}`,
      new Date(expiresAtMs),
    );

    if (count > rule.limit) {
      return {
        allowed: false,
        reason: rule.reason,
        retryAfter: Math.max(1, Math.ceil((expiresAtMs - now) / 1000)),
      };
    }
  }

  return { allowed: true };
}

const rateLimitMessages: Record<RateLimitReason, string> = {
  account_read: "You are making requests quickly.",
  account_write: "You are making changes quickly.",
  tmdb_account_burst: "You are searching quickly.",
  tmdb_account_minute: "You have made several searches.",
  tmdb_application: "TMDB search is busy right now. Your library is still available.",
  tmdb_upstream: "TMDB search is temporarily busy. Your library is still available.",
};

export function rateLimitResponse(decision: Extract<RateLimitDecision, { allowed: false }>) {
  logOperationalEvent("api_rate_limited", {
    reason: decision.reason,
    retryAfter: decision.retryAfter,
    status: 429,
  });

  return NextResponse.json(
    {
      error: `${rateLimitMessages[decision.reason]} Try again in ${decision.retryAfter} ${decision.retryAfter === 1 ? "second" : "seconds"}.`,
      code: "RATE_LIMITED",
      reason: decision.reason,
      retryAfter: decision.retryAfter,
    },
    {
      status: 429,
      headers: {
        "Cache-Control": "private, no-store",
        "Retry-After": String(decision.retryAfter),
      },
    },
  );
}
