import { NextResponse } from "next/server";

import { API_RATE_LIMITS, consumeRateLimits, rateLimitResponse } from "@/lib/api-rate-limit";
import { getRequestUserId } from "@/lib/api-auth";
import { listUserRegions } from "@/lib/account-regions";
import { getUserStreamingServiceIds } from "@/lib/streaming-services";
import { listWatchlistExtras } from "@/lib/watchlist-extras";

export const dynamic = "force-dynamic";

/**
 * What the watchlist knows beyond its own rows: genres, runtime, score and
 * where each title streams. It answers from the normalized catalog only — a
 * page that waited on TMDB would be slower than scrolling — and it carries no
 * library rows of its own, so the list can paint from cache before this lands.
 */
export async function GET(request: Request) {
  const userId = await getRequestUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = await consumeRateLimits(userId, API_RATE_LIMITS.libraryRead);
  if (!limit.allowed) return rateLimitResponse(limit);

  const regions = await listUserRegions(userId);

  const [titles, selectedProviderIds] = await Promise.all([
    listWatchlistExtras(userId, regions),
    getUserStreamingServiceIds(userId, regions),
  ]);

  return NextResponse.json(
    { regions, selectedProviderIds, titles },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
