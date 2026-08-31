import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { API_RATE_LIMITS, consumeRateLimits, rateLimitResponse } from "@/lib/api-rate-limit";
import { getRequestUserId } from "@/lib/api-auth";
import { validateStateChangingApiRequest } from "@/lib/api-request-security";
import { db } from "@/lib/db/client";
import { mediaItems, watchEvents } from "@/lib/db/schema";
import { watchEventSchema } from "@/lib/media-validation";
import { listWatchEvents, recordWatchEvent } from "@/lib/watch-events";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

type ItemRouteContext = { params: Promise<{ id: string }> };

/** Every viewing of one title, newest first. */
export async function GET(request: Request, context: ItemRouteContext) {
  const userId = await getRequestUserId(request);
  if (!userId) return unauthorized();

  const limit = await consumeRateLimits(userId, API_RATE_LIMITS.libraryRead);
  if (!limit.allowed) return rateLimitResponse(limit);

  const { id } = await context.params;
  const events = await listWatchEvents(userId, id);

  return NextResponse.json({ events }, { headers: { "Cache-Control": "private, no-store" } });
}

/**
 * Logs another viewing of a title that has been watched before. The browser
 * supplies the event id, so a retry after a dropped response settles on the
 * same occurrence instead of logging a second one.
 */
export async function POST(request: Request, context: ItemRouteContext) {
  const invalidRequest = validateStateChangingApiRequest(request);
  if (invalidRequest) return invalidRequest;

  const userId = await getRequestUserId(request);
  if (!userId) return unauthorized();

  const limit = await consumeRateLimits(userId, API_RATE_LIMITS.libraryWrite);
  if (!limit.allowed) return rateLimitResponse(limit);

  const parsed = watchEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid viewing.", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const { id } = await context.params;

  const outcome = await db.transaction(async (transaction) => {
    const [existing] = await transaction
      .select({
        id: mediaItems.id,
        status: mediaItems.status,
        rating: mediaItems.rating,
        watchedAt: mediaItems.watchedAt,
      })
      .from(mediaItems)
      .where(and(eq(mediaItems.id, id), eq(mediaItems.userId, userId)))
      .limit(1);

    if (!existing || existing.status === "removed") {
      return { error: "Not found.", status: 404 } as const;
    }

    const event = await recordWatchEvent(transaction, {
      id: input.eventId,
      userId,
      mediaItemId: existing.id,
      watchedOn: input.watchedOn,
      rating: existing.rating,
    });

    if (!event) {
      /* The id is already taken. If it is this account's own retry the request
         has already succeeded; anything else is somebody guessing at ids. */
      const [recorded] = await transaction
        .select()
        .from(watchEvents)
        .where(and(
          eq(watchEvents.id, input.eventId),
          eq(watchEvents.userId, userId),
          eq(watchEvents.mediaItemId, existing.id),
        ))
        .limit(1);

      if (!recorded) {
        return { error: "That viewing has already been recorded.", status: 409 } as const;
      }

      const [item] = await transaction
        .select()
        .from(mediaItems)
        .where(and(eq(mediaItems.id, id), eq(mediaItems.userId, userId)))
        .limit(1);
      return { event: recorded, item } as const;
    }

    /* Midday keeps the day from sliding either side of midnight once it is
       stored as an instant. */
    const watchedAt = input.watchedAt
      ? new Date(input.watchedAt)
      : new Date(`${input.watchedOn}T12:00:00.000Z`);
    /* An older occurrence logged late must not drag the library backwards. */
    const latest = existing.watchedAt && existing.watchedAt > watchedAt ? existing.watchedAt : watchedAt;

    const [item] = await transaction
      .update(mediaItems)
      .set({ status: "watched", watchedAt: latest, pinnedAt: null, updatedAt: new Date() })
      .where(and(eq(mediaItems.id, id), eq(mediaItems.userId, userId)))
      .returning();

    return { event, item } as const;
  });

  if ("error" in outcome) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }

  return NextResponse.json({ event: outcome.event, item: outcome.item }, { status: 201 });
}
