import { NextResponse } from "next/server";

import { API_RATE_LIMITS, consumeRateLimits, rateLimitResponse } from "@/lib/api-rate-limit";
import { getRequestUserId } from "@/lib/api-auth";
import { validateStateChangingApiRequest } from "@/lib/api-request-security";
import { listUserRegions, replaceUserRegions } from "@/lib/account-regions";
import { MAX_ACCOUNT_REGIONS, normalizeRegionCodes } from "@/lib/region";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: Request) {
  const userId = await getRequestUserId(request);
  if (!userId) return unauthorized();

  const limit = await consumeRateLimits(userId, API_RATE_LIMITS.libraryRead);
  if (!limit.allowed) return rateLimitResponse(limit);

  return NextResponse.json(
    { regions: await listUserRegions(userId) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

/** The whole list at once, in order: the first country is home. */
export async function PUT(request: Request) {
  const invalidRequest = validateStateChangingApiRequest(request);
  if (invalidRequest) return invalidRequest;

  const userId = await getRequestUserId(request);
  if (!userId) return unauthorized();

  const limit = await consumeRateLimits(userId, API_RATE_LIMITS.libraryWrite);
  if (!limit.allowed) return rateLimitResponse(limit);

  const body = await request.json().catch(() => null);
  const regions = normalizeRegionCodes((body as { regions?: unknown } | null)?.regions);

  if (!regions) {
    return NextResponse.json(
      { error: `Choose up to ${MAX_ACCOUNT_REGIONS} countries.` },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { regions: await replaceUserRegions(userId, regions) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
