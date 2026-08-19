import { NextResponse } from "next/server";

import {
  API_RATE_LIMITS,
  consumeRateLimits,
  rateLimitResponse,
} from "@/lib/api-rate-limit";
import { getRequestUserId } from "@/lib/api-auth";
import { tmdbFetch } from "@/lib/tmdb-client";
import {
  type TmdbWatchRegionPayload,
  cacheWatchRegions,
  getCachedWatchRegions,
  mapWatchRegions,
} from "@/lib/watch-providers";

export const dynamic = "force-dynamic";

/**
 * TMDB only has availability for a subset of countries, so the picker is built
 * from this list rather than a full ISO table — offering a country that can
 * never return results would be a lie.
 */
export async function GET(request: Request) {
  const userId = await getRequestUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = await consumeRateLimits(userId, API_RATE_LIMITS.libraryRead);
  if (!limit.allowed) return rateLimitResponse(limit);

  const cached = await getCachedWatchRegions();
  if (cached) {
    return NextResponse.json(
      { regions: cached },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const upstream = await tmdbFetch<TmdbWatchRegionPayload>("/watch/providers/regions", {
    language: "en-US",
  });

  if (!upstream.ok) {
    if (upstream.kind === "rate_limited") {
      return rateLimitResponse({
        allowed: false,
        reason: "tmdb_upstream",
        retryAfter: upstream.retryAfter,
      });
    }

    const status = upstream.kind === "unconfigured" ? 503 : 502;
    return NextResponse.json({ error: "Country list is unavailable right now." }, { status });
  }

  const regions = mapWatchRegions(upstream.data);
  if (regions.length > 0) await cacheWatchRegions(regions);

  return NextResponse.json(
    { regions },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
