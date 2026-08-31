import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

import { API_RATE_LIMITS, consumeRateLimits, rateLimitResponse } from "@/lib/api-rate-limit";
import { getRequestUserId } from "@/lib/api-auth";
import { validateStateChangingApiRequest } from "@/lib/api-request-security";
import { db } from "@/lib/db/client";
import { mediaItems } from "@/lib/db/schema";
import { updateMediaItemSchema } from "@/lib/media-validation";
import { recordWatchEvent, resolveWatchedOn, syncLatestWatchEvent } from "@/lib/watch-events";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

type ItemRouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: ItemRouteContext) {
  const invalidRequest = validateStateChangingApiRequest(request);
  if (invalidRequest) return invalidRequest;

  const userId = await getRequestUserId(request);
  if (!userId) return unauthorized();

  const limit = await consumeRateLimits(userId, API_RATE_LIMITS.libraryWrite);
  if (!limit.allowed) return rateLimitResponse(limit);

  const parsed = updateMediaItemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update.", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const { id } = await context.params;

  /* The item and its history move together: a viewing that is half recorded is
     worse than one that failed outright. */
  const outcome = await db.transaction(async (transaction) => {
    const [existing] = await transaction
      .select({
        id: mediaItems.id,
        status: mediaItems.status,
        watchedAt: mediaItems.watchedAt,
        rating: mediaItems.rating,
      })
      .from(mediaItems)
      .where(and(eq(mediaItems.id, id), eq(mediaItems.userId, userId)))
      .limit(1);

    if (!existing || (existing.status === "removed" && !input.status)) {
      return { error: "Not found.", status: 404 } as const;
    }

    const values: {
      status?: "watchlist" | "watched";
      watchlistNote?: string | null;
      reviewNote?: string | null;
      rating?: number | null;
      watchedAt?: Date | null;
      pinnedAt?: Date | null;
      updatedAt: Date;
    } = { updatedAt: new Date() };

    /* A pin says "watch this soon", so it only means anything on the watchlist.
       Removal deliberately leaves it in place: Undo restores the pin with the
       title, while an explicit re-add clears it. */
    const nextStatus = input.status ?? existing.status;
    if (input.pinned === true && (nextStatus !== "watchlist" || existing.status === "removed")) {
      return { error: "Only watchlist titles can be pinned.", status: 409 } as const;
    }
    if (typeof input.pinned === "boolean") values.pinnedAt = input.pinned ? new Date() : null;
    if (nextStatus === "watched") values.pinnedAt = null;

    if (input.status) {
      values.status = input.status;
      if (input.status === "watched" && existing.status !== "watched") values.watchedAt = new Date();
      if (input.status === "watchlist") values.watchedAt = null;
    }
    /* An explicit date wins over the one the status change would have stamped,
       but only while the title is actually watched. */
    if ("watchedAt" in input && nextStatus === "watched") {
      values.watchedAt = input.watchedAt ? new Date(input.watchedAt) : null;
    }
    if ("watchlistNote" in input) values.watchlistNote = input.watchlistNote ?? null;
    if ("reviewNote" in input) values.reviewNote = input.reviewNote ?? null;
    if ("rating" in input) values.rating = input.rating ?? null;

    const firstWatch = input.status === "watched" && existing.status !== "watched";
    const conditions = [eq(mediaItems.id, id), eq(mediaItems.userId, userId)];
    /* Two requests marking the same title watched must produce one viewing, so
       the transition is claimed by the update itself. */
    if (firstWatch) conditions.push(ne(mediaItems.status, "watched"));

    const [item] = await transaction
      .update(mediaItems)
      .set(values)
      .where(and(...conditions))
      .returning();

    if (!item) {
      const [current] = await transaction
        .select()
        .from(mediaItems)
        .where(and(eq(mediaItems.id, id), eq(mediaItems.userId, userId)))
        .limit(1);
      return { item: current } as const;
    }

    if (item.status === "watched") {
      if (firstWatch) {
        await recordWatchEvent(transaction, {
          id: crypto.randomUUID(),
          userId,
          mediaItemId: item.id,
          watchedOn: resolveWatchedOn(input, item.watchedAt),
          rating: item.rating,
        });
      } else if ("watchedOn" in input || "watchedAt" in input || "rating" in input) {
        /* Editing the date or the score revises the viewing on record rather
           than adding one. */
        await syncLatestWatchEvent(transaction, item, {
          ...(input.watchedOn || input.watchedAt
            ? { watchedOn: resolveWatchedOn(input, item.watchedAt) }
            : {}),
          ...("rating" in input ? { rating: item.rating } : {}),
        });
      }
    }

    return { item } as const;
  });

  if ("error" in outcome) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }

  return NextResponse.json({ item: outcome.item });
}

export async function DELETE(request: Request, context: ItemRouteContext) {
  const invalidRequest = validateStateChangingApiRequest(request);
  if (invalidRequest) return invalidRequest;

  const userId = await getRequestUserId(request);
  if (!userId) return unauthorized();

  const limit = await consumeRateLimits(userId, API_RATE_LIMITS.libraryWrite);
  if (!limit.allowed) return rateLimitResponse(limit);

  const { id } = await context.params;
  /* History is deliberately untouched: removal is reversible, and a viewing
     that happened stays true either way. */
  const [item] = await db
    .update(mediaItems)
    .set({ status: "removed", updatedAt: new Date() })
    .where(
      and(
        eq(mediaItems.id, id),
        eq(mediaItems.userId, userId),
        ne(mediaItems.status, "removed"),
      ),
    )
    .returning();

  if (!item) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ item });
}
