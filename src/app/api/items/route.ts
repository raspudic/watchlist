import { and, desc, eq, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { API_RATE_LIMITS, consumeRateLimits, rateLimitResponse } from "@/lib/api-rate-limit";
import { getRequestUserId } from "@/lib/api-auth";
import { validateStateChangingApiRequest } from "@/lib/api-request-security";
import { db } from "@/lib/db/client";
import { mediaItems } from "@/lib/db/schema";
import { createMediaItemSchema, itemStatusSchema } from "@/lib/media-validation";

export const dynamic = "force-dynamic";

const scopeSchema = z.literal("bulk").optional();

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: Request) {
  const userId = await getRequestUserId(request);

  if (!userId) return unauthorized();

  const limit = await consumeRateLimits(userId, API_RATE_LIMITS.libraryRead);
  if (!limit.allowed) return rateLimitResponse(limit);

  const statusValue = new URL(request.url).searchParams.get("status");
  const parsedStatus = statusValue ? itemStatusSchema.safeParse(statusValue) : null;

  if (parsedStatus && !parsedStatus.success) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const conditions = [eq(mediaItems.userId, userId), ne(mediaItems.status, "removed")];
  if (parsedStatus?.success) conditions.push(eq(mediaItems.status, parsedStatus.data));

  const items = await db
    .select()
    .from(mediaItems)
    .where(and(...conditions))
    .orderBy(desc(mediaItems.addedAt));

  return NextResponse.json(
    { items },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const invalidRequest = validateStateChangingApiRequest(request);
  if (invalidRequest) return invalidRequest;

  const userId = await getRequestUserId(request);

  if (!userId) return unauthorized();

  const parsedScope = scopeSchema.safeParse(new URL(request.url).searchParams.get("scope") ?? undefined);
  const limit = await consumeRateLimits(
    userId,
    parsedScope.success && parsedScope.data === "bulk"
      ? API_RATE_LIMITS.libraryBulkWrite
      : API_RATE_LIMITS.libraryWrite,
  );
  if (!limit.allowed) return rateLimitResponse(limit);

  const parsed = createMediaItemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid media item.", details: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;
  const provider = input.provider;
  const existing = [] as (typeof mediaItems.$inferSelect)[];
  if (provider === "tmdb") {
    const matches = await db
      .select()
      .from(mediaItems)
      .where(
        and(
          eq(mediaItems.userId, userId),
          eq(mediaItems.provider, provider),
          eq(mediaItems.mediaType, input.mediaType),
          eq(mediaItems.externalId, input.externalId),
        ),
      )
      .limit(1);
    existing.push(...matches);
  } else {
    const matches = await db
      .select()
      .from(mediaItems)
      .where(
        and(
          eq(mediaItems.userId, userId),
          eq(mediaItems.provider, provider),
          sql`lower(${mediaItems.title}) = lower(${input.title})`,
        ),
      )
      .limit(1);
    existing.push(...matches);
  }

  if (existing[0]) {
    if (existing[0].status !== "removed") {
      return NextResponse.json({ error: "This title is already in your library." }, { status: 409 });
    }

    /* Re-adding a removed title is a fresh save, not a restore — Undo is the
       restore, and it goes through PATCH. So the row keeps its id and its
       viewing history, and everything the reader had written about it goes:
       the note reads as much like stale data as the rating beside it, and a
       title saved years ago and re-added today is a save from today. */
    const [item] = await db
      .update(mediaItems)
      .set({
        status: "watchlist",
        watchedAt: null,
        pinnedAt: null,
        rating: null,
        reviewNote: null,
        watchlistNote: input.watchlistNote ?? null,
        addedAt: new Date(),
        title: input.title,
        originalTitle: input.originalTitle ?? null,
        releaseYear: input.releaseYear ?? null,
        posterPath: provider === "tmdb" ? input.posterPath ?? null : null,
        overview: input.overview ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(mediaItems.id, existing[0].id), eq(mediaItems.userId, userId)))
      .returning();

    return NextResponse.json({ item, readded: true });
  }

  const [item] = await db
    .insert(mediaItems)
    .values({
      id: crypto.randomUUID(),
      userId,
      provider,
      externalId: provider === "tmdb" ? input.externalId : null,
      mediaType: input.mediaType,
      title: input.title,
      originalTitle: input.originalTitle ?? null,
      releaseYear: input.releaseYear ?? null,
      posterPath: provider === "tmdb" ? input.posterPath ?? null : null,
      overview: input.overview ?? null,
      watchlistNote: input.watchlistNote ?? null,
    })
    .returning();

  return NextResponse.json({ item }, { status: 201 });
}
