import { NextResponse } from "next/server";
import { z } from "zod";

import { API_RATE_LIMITS, consumeRateLimits, rateLimitResponse } from "@/lib/api-rate-limit";
import { getRequestUserId } from "@/lib/api-auth";
import { listInsightsEvents } from "@/lib/insights-data";
import { summarizeInsights } from "@/lib/insights";

export const dynamic = "force-dynamic";

/* The browser sends the year it is showing and its own today: a reader just
   past midnight on 1 January is in a different year from the server, and a
   week only means anything relative to the reader's calendar. */
const scopeSchema = z.object({
  year: z.coerce.number().int().min(1888).max(3000),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period: z.enum(["week", "month", "year"]),
});

export async function GET(request: Request) {
  const userId = await getRequestUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = await consumeRateLimits(userId, API_RATE_LIMITS.libraryRead);
  if (!limit.allowed) return rateLimitResponse(limit);

  const now = new Date();
  const params = new URL(request.url).searchParams;
  const parsed = scopeSchema.safeParse({
    year: params.get("year") ?? now.getUTCFullYear(),
    today: params.get("today") ?? now.toISOString().slice(0, 10),
    period: params.get("period") ?? "year",
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid year and period." }, { status: 400 });
  }

  /* A week or a month is only meaningful inside the year the reader is in;
     asking for last week of 2019 has no answer, so a past year is its year. */
  const scope = parsed.data.year === Number(parsed.data.today.slice(0, 4))
    ? parsed.data
    : { ...parsed.data, period: "year" as const };

  const summary = summarizeInsights(await listInsightsEvents(userId), scope);

  return NextResponse.json(summary, { headers: { "Cache-Control": "private, no-store" } });
}
