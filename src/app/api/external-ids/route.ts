import { NextResponse } from "next/server";
import { z } from "zod";

import {
  API_RATE_LIMITS,
  consumeRateLimits,
  rateLimitResponse,
} from "@/lib/api-rate-limit";
import { getRequestUserId } from "@/lib/api-auth";
import {
  type TmdbExternalIdPayload,
  cacheExternalIds,
  getCachedExternalIds,
  mapExternalIds,
} from "@/lib/external-ids";
import { logOperationalEvent } from "@/lib/operational-events";
import { tmdbFetch } from "@/lib/tmdb-client";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  mediaType: z.enum(["movie", "tv"]),
  tmdbId: z.coerce.number().int().positive(),
});

export async function GET(request: Request) {
  const startedAt = performance.now();
  const userId = await getRequestUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searchParams = new URL(request.url).searchParams;
  const parsed = paramsSchema.safeParse({
    mediaType: searchParams.get("mediaType"),
    tmdbId: searchParams.get("tmdbId"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid external id request." }, { status: 400 });
  }

  const { mediaType, tmdbId } = parsed.data;

  if (!process.env.TMDB_ACCESS_TOKEN) {
    return NextResponse.json({ error: "External links are not configured yet." }, { status: 503 });
  }

  const accountLimit = await consumeRateLimits(userId, API_RATE_LIMITS.tmdbDetailSheet);
  if (!accountLimit.allowed) return rateLimitResponse(accountLimit);

  const cached = await getCachedExternalIds(mediaType, tmdbId);
  if (cached) {
    logOperationalEvent("tmdb_external_ids_completed", {
      cacheHit: true,
      durationMs: Math.round(performance.now() - startedAt),
      status: 200,
    });
    return NextResponse.json(
      { externalIds: cached },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const applicationLimit = await consumeRateLimits("application", API_RATE_LIMITS.tmdbApplication);
  if (!applicationLimit.allowed) return rateLimitResponse(applicationLimit);

  const upstream = await tmdbFetch<TmdbExternalIdPayload>(`/${mediaType}/${tmdbId}/external_ids`);

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
      return NextResponse.json({ error: "External links are not configured yet." }, { status: 503 });
    }

    logOperationalEvent("tmdb_external_ids_failed", {
      durationMs: Math.round(performance.now() - startedAt),
      status: upstream.status,
    });
    return NextResponse.json({ error: "External links are unavailable right now." }, { status: 502 });
  }

  const externalIds = mapExternalIds(upstream.data);
  await cacheExternalIds(mediaType, tmdbId, externalIds);
  logOperationalEvent("tmdb_external_ids_completed", {
    cacheHit: false,
    durationMs: Math.round(performance.now() - startedAt),
    status: 200,
  });

  return NextResponse.json(
    { externalIds },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
