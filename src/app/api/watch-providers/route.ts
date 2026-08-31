import { NextResponse } from "next/server";
import { z } from "zod";

import {
  API_RATE_LIMITS,
  consumeRateLimits,
  rateLimitResponse,
} from "@/lib/api-rate-limit";
import { getRequestUserId } from "@/lib/api-auth";
import { cacheCatalogAvailability, getCatalogWatchProviders } from "@/lib/catalog";
import { logOperationalEvent } from "@/lib/operational-events";
import { tmdbFetch } from "@/lib/tmdb-client";
import {
  type TmdbWatchProviderPayload,
  cacheWatchProviders,
  getCachedWatchProviders,
  mapWatchProviders,
} from "@/lib/watch-providers";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  mediaType: z.enum(["movie", "tv"]),
  tmdbId: z.coerce.number().int().positive(),
  region: z.string().regex(/^[A-Z]{2}$/),
});

export async function GET(request: Request) {
  const startedAt = performance.now();
  const userId = await getRequestUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searchParams = new URL(request.url).searchParams;
  const parsed = paramsSchema.safeParse({
    mediaType: searchParams.get("mediaType"),
    tmdbId: searchParams.get("tmdbId"),
    region: searchParams.get("region"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid watch provider request." }, { status: 400 });
  }

  const { mediaType, region, tmdbId } = parsed.data;

  if (!process.env.TMDB_ACCESS_TOKEN) {
    return NextResponse.json({ error: "Streaming data is not configured yet." }, { status: 503 });
  }

  const accountLimit = await consumeRateLimits(userId, API_RATE_LIMITS.tmdbDetailSheet);
  if (!accountLimit.allowed) return rateLimitResponse(accountLimit);

  const catalogCached = await getCatalogWatchProviders(mediaType, tmdbId, region);
  const cached = catalogCached ?? await getCachedWatchProviders(mediaType, tmdbId, region);
  if (cached) {
    logOperationalEvent("tmdb_watch_providers_completed", {
      cacheHit: true,
      durationMs: Math.round(performance.now() - startedAt),
      status: 200,
    });
    return NextResponse.json(
      { providers: cached },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const applicationLimit = await consumeRateLimits("application", API_RATE_LIMITS.tmdbApplication);
  if (!applicationLimit.allowed) return rateLimitResponse(applicationLimit);

  const upstream = await tmdbFetch<TmdbWatchProviderPayload>(
    `/${mediaType}/${tmdbId}/watch/providers`,
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
      return NextResponse.json({ error: "Streaming data is not configured yet." }, { status: 503 });
    }

    logOperationalEvent("tmdb_watch_providers_failed", {
      durationMs: Math.round(performance.now() - startedAt),
      status: upstream.status,
    });
    return NextResponse.json({ error: "Streaming data is unavailable right now." }, { status: 502 });
  }

  const providers = mapWatchProviders(upstream.data, region);
  await Promise.all([
    cacheWatchProviders(mediaType, tmdbId, region, providers),
    cacheCatalogAvailability(mediaType, tmdbId, upstream.data),
  ]);
  logOperationalEvent("tmdb_watch_providers_completed", {
    cacheHit: false,
    durationMs: Math.round(performance.now() - startedAt),
    status: 200,
  });

  return NextResponse.json(
    { providers },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
