import { NextResponse } from "next/server";
import { z } from "zod";

import { API_RATE_LIMITS, consumeRateLimits, rateLimitResponse } from "@/lib/api-rate-limit";
import { getRequestUserId } from "@/lib/api-auth";
import { validateStateChangingApiRequest } from "@/lib/api-request-security";
import { listUserRegions } from "@/lib/account-regions";
import {
  UnknownStreamingServiceError,
  getUserStreamingServiceIds,
  listStreamingServicesForRegions,
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

async function responseBody(userId: string, regions: string[]) {
  let providers = await listStreamingServicesForRegions(regions);

  if (providers.length === 0 && process.env.TMDB_ACCESS_TOKEN) {
    const accountLimit = await consumeRateLimits(userId, API_RATE_LIMITS.tmdbDetailSheet);
    if (!accountLimit.allowed) return { limited: accountLimit } as const;

    const applicationLimit = await consumeRateLimits("application", API_RATE_LIMITS.tmdbApplication);
    if (!applicationLimit.allowed) return { limited: applicationLimit } as const;

    await refreshStreamingProviderDirectory();
    providers = await listStreamingServicesForRegions(regions);
  }

  const selectedProviderIds = await getUserStreamingServiceIds(userId, regions);
  return { body: { providers, regions, selectedProviderIds } } as const;
}

export async function GET(request: Request) {
  const userId = await getRequestUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = await consumeRateLimits(userId, API_RATE_LIMITS.libraryRead);
  if (!limit.allowed) return rateLimitResponse(limit);

  const regions = await listUserRegions(userId);
  if (regions.length === 0) {
    return NextResponse.json(
      { providers: [], regions: [], selectedProviderIds: [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    const result = await responseBody(userId, regions);
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

  const regions = await listUserRegions(userId);
  if (regions.length === 0) {
    return NextResponse.json({ error: "Choose a country before saving services." }, { status: 409 });
  }

  try {
    const selectedProviderIds = await replaceUserStreamingServices(
      userId,
      regions,
      parsed.data.providerIds,
    );
    const providers = await listStreamingServicesForRegions(regions);
    return NextResponse.json(
      { providers, regions, selectedProviderIds },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (caught) {
    if (caught instanceof UnknownStreamingServiceError) {
      return NextResponse.json({ error: "One or more services are unavailable in your countries." }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not save streaming services." }, { status: 500 });
  }
}
