import { NextResponse } from "next/server";
import { z } from "zod";

import {
  API_RATE_LIMITS,
  consumeRateLimits,
  rateLimitResponse,
} from "@/lib/api-rate-limit";
import { getRequestUserId } from "@/lib/api-auth";
import { logOperationalEvent } from "@/lib/operational-events";
import { tmdbFetch } from "@/lib/tmdb-client";
import {
  cacheTmdbSearch,
  getCachedTmdbSearch,
  mapTmdbResults,
} from "@/lib/tmdb-search";

export const dynamic = "force-dynamic";

const querySchema = z.string().trim().min(1).max(100);
const scopeSchema = z.literal("bulk").optional();

export async function GET(request: Request) {
  const startedAt = performance.now();
  const userId = await getRequestUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const parsedQuery = querySchema.safeParse(searchParams.get("q") ?? "");
  if (!parsedQuery.success) {
    return NextResponse.json({ error: "Enter a title to search for." }, { status: 400 });
  }
  const parsedScope = scopeSchema.safeParse(searchParams.get("scope") ?? undefined);

  if (!process.env.TMDB_ACCESS_TOKEN) {
    return NextResponse.json({ error: "Search is not configured yet." }, { status: 503 });
  }

  const accountLimit = await consumeRateLimits(
    userId,
    parsedScope.success && parsedScope.data === "bulk"
      ? API_RATE_LIMITS.tmdbBulkImport
      : API_RATE_LIMITS.tmdbAccount,
  );
  if (!accountLimit.allowed) return rateLimitResponse(accountLimit);

  const cached = await getCachedTmdbSearch(parsedQuery.data);
  if (cached) {
    logOperationalEvent("tmdb_search_completed", {
      cacheHit: true,
      durationMs: Math.round(performance.now() - startedAt),
      status: 200,
    });
    return NextResponse.json(
      { results: cached },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const applicationLimit = await consumeRateLimits("application", API_RATE_LIMITS.tmdbApplication);
  if (!applicationLimit.allowed) return rateLimitResponse(applicationLimit);

  const upstream = await tmdbFetch<{ results?: Parameters<typeof mapTmdbResults>[0] }>(
    "/search/multi",
    { query: parsedQuery.data, include_adult: "false", language: "en-US", page: "1" },
  );

  if (!upstream.ok) {
    if (upstream.kind === "rate_limited") {
      logOperationalEvent("tmdb_upstream_limited", {
        durationMs: Math.round(performance.now() - startedAt),
        retryAfter: upstream.retryAfter,
        status: 429,
      });
      return rateLimitResponse({
        allowed: false,
        reason: "tmdb_upstream",
        retryAfter: upstream.retryAfter,
      });
    }

    if (upstream.kind === "unconfigured") {
      return NextResponse.json({ error: "Search is not configured yet." }, { status: 503 });
    }

    logOperationalEvent("tmdb_search_failed", {
      durationMs: Math.round(performance.now() - startedAt),
      status: upstream.status,
    });
    return NextResponse.json({ error: "Search is temporarily unavailable." }, { status: 502 });
  }

  let results;
  try {
    results = mapTmdbResults(upstream.data.results ?? []);
  } catch {
    logOperationalEvent("tmdb_search_failed", {
      durationMs: Math.round(performance.now() - startedAt),
      status: 502,
    });
    return NextResponse.json({ error: "Search is temporarily unavailable." }, { status: 502 });
  }

  await cacheTmdbSearch(parsedQuery.data, results);
  logOperationalEvent("tmdb_search_completed", {
    cacheHit: false,
    durationMs: Math.round(performance.now() - startedAt),
    status: 200,
  });

  return NextResponse.json(
    { results },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
