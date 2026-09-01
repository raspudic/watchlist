import { NextResponse } from "next/server";
import { z } from "zod";

import { API_RATE_LIMITS, consumeRateLimits, rateLimitResponse } from "@/lib/api-rate-limit";
import { getRequestUserId } from "@/lib/api-auth";
import { listInsightsEvents } from "@/lib/insights-data";
import { summarizeInsights } from "@/lib/insights";

export const dynamic = "force-dynamic";

/* The browser sends the year and month it is showing: a reader just past
   midnight on 1 January is in a different year from the server. */
const periodSchema = z.object({
  year: z.coerce.number().int().min(1888).max(3000),
  month: z.coerce.number().int().min(1).max(12),
});

export async function GET(request: Request) {
  const userId = await getRequestUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = await consumeRateLimits(userId, API_RATE_LIMITS.libraryRead);
  if (!limit.allowed) return rateLimitResponse(limit);

  const now = new Date();
  const params = new URL(request.url).searchParams;
  const parsed = periodSchema.safeParse({
    year: params.get("year") ?? now.getUTCFullYear(),
    month: params.get("month") ?? now.getUTCMonth() + 1,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid year and month." }, { status: 400 });
  }

  const summary = summarizeInsights(await listInsightsEvents(userId), parsed.data);

  return NextResponse.json(summary, { headers: { "Cache-Control": "private, no-store" } });
}
