import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { API_RATE_LIMITS, consumeRateLimits, rateLimitResponse } from "@/lib/api-rate-limit";
import { getRequestUserId } from "@/lib/api-auth";
import { db } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { isRegionCode } from "@/lib/region";
import { getUserStreamingServiceIds } from "@/lib/streaming-services";
import { listTonightCandidates } from "@/lib/tonight-candidates";

export const dynamic = "force-dynamic";

/**
 * Everything Tonight needs in one authenticated read. It answers from the
 * normalized catalog only: a picker that waited on TMDB would be slower than
 * scrolling the watchlist, and the daily refresh already keeps the catalog warm.
 */
export async function GET(request: Request) {
  const userId = await getRequestUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = await consumeRateLimits(userId, API_RATE_LIMITS.libraryRead);
  if (!limit.allowed) return rateLimitResponse(limit);

  const [account] = await db
    .select({ region: user.region })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  const region = isRegionCode(account?.region) ? account.region : null;

  const [candidates, selectedProviderIds] = await Promise.all([
    listTonightCandidates(userId, region),
    region ? getUserStreamingServiceIds(userId, region) : Promise.resolve([]),
  ]);

  return NextResponse.json(
    { region, selectedProviderIds, candidates },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
