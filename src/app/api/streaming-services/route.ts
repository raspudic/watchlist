import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { API_RATE_LIMITS, consumeRateLimits, rateLimitResponse } from "@/lib/api-rate-limit";
import { getRequestUserId } from "@/lib/api-auth";
import { validateStateChangingApiRequest } from "@/lib/api-request-security";
import { db } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { isRegionCode } from "@/lib/region";
import {
  UnknownStreamingServiceError,
  getUserStreamingServiceIds,
  listStreamingServicesForRegion,
  refreshStreamingProviderDirectory,
  replaceUserStreamingServices,
} from "@/lib/streaming-services";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  providerIds: z.array(z.number().int().positive()).max(50).refine(
    (ids) => new Set(ids).size === ids.length,
    "Choose each streaming service once.",
  ),
});

async function getSavedRegion(userId: string) {
  const [account] = await db
    .select({ region: user.region })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return isRegionCode(account?.region) ? account.region : null;
}

async function responseBody(userId: string, region: string) {
  let providers = await listStreamingServicesForRegion(region);

  if (providers.length === 0 && process.env.TMDB_ACCESS_TOKEN) {
    const accountLimit = await consumeRateLimits(userId, API_RATE_LIMITS.tmdbDetailSheet);
    if (!accountLimit.allowed) return { limited: accountLimit } as const;

    const applicationLimit = await consumeRateLimits("application", API_RATE_LIMITS.tmdbApplication);
    if (!applicationLimit.allowed) return { limited: applicationLimit } as const;

    await refreshStreamingProviderDirectory();
    providers = await listStreamingServicesForRegion(region);
  }

  const selectedProviderIds = await getUserStreamingServiceIds(userId, region);
  return { body: { providers, region, selectedProviderIds } } as const;
}

export async function GET(request: Request) {
  const userId = await getRequestUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = await consumeRateLimits(userId, API_RATE_LIMITS.libraryRead);
  if (!limit.allowed) return rateLimitResponse(limit);

  const region = await getSavedRegion(userId);
  if (!region) {
    return NextResponse.json(
      { providers: [], region: null, selectedProviderIds: [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    const result = await responseBody(userId, region);
    if ("limited" in result && result.limited) return rateLimitResponse(result.limited);
    return NextResponse.json(result.body, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json(
      { error: "Streaming services are unavailable right now." },
      { status: 502 },
    );
  }
}

export async function PUT(request: Request) {
  const invalidRequest = validateStateChangingApiRequest(request);
  if (invalidRequest) return invalidRequest;

  const userId = await getRequestUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = await consumeRateLimits(userId, API_RATE_LIMITS.libraryWrite);
  if (!limit.allowed) return rateLimitResponse(limit);

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose valid streaming services." }, { status: 400 });
  }

  const region = await getSavedRegion(userId);
  if (!region) {
    return NextResponse.json({ error: "Choose a country before saving services." }, { status: 409 });
  }

  try {
    const selectedProviderIds = await replaceUserStreamingServices(
      userId,
      region,
      parsed.data.providerIds,
    );
    const providers = await listStreamingServicesForRegion(region);
    return NextResponse.json(
      { providers, region, selectedProviderIds },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (caught) {
    if (caught instanceof UnknownStreamingServiceError) {
      return NextResponse.json({ error: "One or more services are unavailable in this country." }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not save streaming services." }, { status: 500 });
  }
}
