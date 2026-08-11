import { and, desc, eq, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getRequestUserId } from "@/lib/api-auth";
import { db } from "@/lib/db/client";
import { mediaItems } from "@/lib/db/schema";
import { createMediaItemSchema, itemStatusSchema } from "@/lib/media-validation";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: Request) {
  const userId = await getRequestUserId(request);

  if (!userId) return unauthorized();

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
  const userId = await getRequestUserId(request);

  if (!userId) return unauthorized();

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

    const [item] = await db
      .update(mediaItems)
      .set({
        status: "watchlist",
        watchedAt: null,
        rating: null,
        reviewNote: null,
        watchlistNote: input.watchlistNote ?? existing[0].watchlistNote,
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
