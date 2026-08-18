import { NextResponse } from "next/server";
import { z } from "zod";

import {
  API_RATE_LIMITS,
  consumeRateLimits,
  rateLimitResponse,
} from "@/lib/api-rate-limit";
import { getRequestUserId } from "@/lib/api-auth";
import { logOperationalEvent } from "@/lib/operational-events";
import {
  cacheTmdbSearch,
  getCachedTmdbSearch,
  mapTmdbResults,
  parseRetryAfter,
} from "@/lib/tmdb-search";

export const dynamic = "force-dynamic";

const querySchema = z.string().trim().min(1).max(100);

export async function GET(request: Request) {
  const startedAt = performance.now();
  const userId = await getRequestUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsedQuery = querySchema.safeParse(new URL(request.url).searchParams.get("q") ?? "");
  if (!parsedQuery.success) {
    return NextResponse.json({ error: "Enter a title to search for." }, { status: 400 });
  }

  const token = process.env.TMDB_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Search is not configured yet." }, { status: 503 });
  }

  const accountLimit = await consumeRateLimits(userId, API_RATE_LIMITS.tmdbAccount);
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

  const url = new URL("https://api.themoviedb.org/3/search/multi");
  url.searchParams.set("query", parsedQuery.data);
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("language", "en-US");
  url.searchParams.set("page", "1");

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    logOperationalEvent("tmdb_search_failed", {
      durationMs: Math.round(performance.now() - startedAt),
      status: 502,
    });
    return NextResponse.json({ error: "Search is temporarily unavailable." }, { status: 502 });
  }

  if (response.status === 429) {
    const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
    logOperationalEvent("tmdb_upstream_limited", {
      durationMs: Math.round(performance.now() - startedAt),
      retryAfter,
      status: 429,
    });
    return rateLimitResponse({ allowed: false, reason: "tmdb_upstream", retryAfter });
  }

  if (!response.ok) {
    logOperationalEvent("tmdb_search_failed", {
      durationMs: Math.round(performance.now() - startedAt),
      status: response.status,
    });
    return NextResponse.json({ error: "Search is temporarily unavailable." }, { status: 502 });
  }

  let results;
  try {
    const payload = (await response.json()) as { results?: Parameters<typeof mapTmdbResults>[0] };
    results = mapTmdbResults(payload.results ?? []);
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
