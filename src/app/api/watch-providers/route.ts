import { NextResponse } from "next/server";
import { z } from "zod";

import {
  API_RATE_LIMITS,
  consumeRateLimits,
  rateLimitResponse,
} from "@/lib/api-rate-limit";
import { getRequestUserId } from "@/lib/api-auth";
import { listUserRegions } from "@/lib/account-regions";
import { cacheCatalogAvailability, getCatalogWatchProvidersForRegions } from "@/lib/catalog";
import { logOperationalEvent } from "@/lib/operational-events";
import { tmdbFetch } from "@/lib/tmdb-client";
import { normalizeRegionCodes } from "@/lib/region";
import {
  type TitleWatchProviders,
  type TmdbWatchProviderPayload,
  cacheWatchProviders,
  getCachedWatchProviders,
  mapWatchProviders,
} from "@/lib/watch-providers";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  mediaType: z.enum(["movie", "tv"]),
  tmdbId: z.coerce.number().int().positive(),
  /* One or more countries. TMDB answers for every country in a single
     response, so asking about three costs exactly what asking about one does. */
  regions: z.string().min(2),
});

export async function GET(request: Request) {
  const startedAt = performance.now();
  const userId = await getRequestUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searchParams = new URL(request.url).searchParams;
  const parsed = paramsSchema.safeParse({
    mediaType: searchParams.get("mediaType"),
    tmdbId: searchParams.get("tmdbId"),
    regions: searchParams.get("regions"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid watch provider request." }, { status: 400 });
  }

  const { mediaType, tmdbId } = parsed.data;
  const requested = normalizeRegionCodes(parsed.data.regions.split(","));

  if (!requested || requested.length === 0) {
    return NextResponse.json({ error: "Invalid watch provider request." }, { status: 400 });
  }

  /* Only the account's own countries: this route is not a way to ask TMDB
     about anywhere in the world. */
  const saved = await listUserRegions(userId);
  const regions = requested.filter((region) => saved.includes(region));

  if (regions.length === 0) {
    return NextResponse.json({ error: "Choose one of your saved countries." }, { status: 400 });
  }

  if (!process.env.TMDB_ACCESS_TOKEN) {
    return NextResponse.json({ error: "Streaming data is not configured yet." }, { status: 503 });
  }

  const accountLimit = await consumeRateLimits(userId, API_RATE_LIMITS.tmdbDetailSheet);
  if (!accountLimit.allowed) return rateLimitResponse(accountLimit);

  const answers: Record<string, TitleWatchProviders> = {
    ...await getCatalogWatchProvidersForRegions(mediaType, tmdbId, regions),
  };
  for (const region of regions) {
    if (answers[region]) continue;
    const cached = await getCachedWatchProviders(mediaType, tmdbId, region);
    if (cached) answers[region] = cached;
  }

  const missing = regions.filter((region) => !answers[region]);
  if (missing.length === 0) {
    logOperationalEvent("tmdb_watch_providers_completed", {
      cacheHit: true,
      durationMs: Math.round(performance.now() - startedAt),
      status: 200,
    });
    return NextResponse.json(
      { providers: answers },
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

  for (const region of missing) answers[region] = mapWatchProviders(upstream.data, region);
  await Promise.all([
    ...missing.map((region) => cacheWatchProviders(mediaType, tmdbId, region, answers[region])),
    cacheCatalogAvailability(mediaType, tmdbId, upstream.data),
  ]);
  logOperationalEvent("tmdb_watch_providers_completed", {
    cacheHit: false,
    durationMs: Math.round(performance.now() - startedAt),
    status: 200,
  });

  return NextResponse.json(
    { providers: answers },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
