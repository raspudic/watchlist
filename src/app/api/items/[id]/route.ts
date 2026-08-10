import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getRequestUserId } from "@/lib/api-auth";
import { db } from "@/lib/db/client";
import { mediaItems } from "@/lib/db/schema";
import { updateMediaItemSchema } from "@/lib/media-validation";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

type ItemRouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: ItemRouteContext) {
  const userId = await getRequestUserId(request);
  if (!userId) return unauthorized();

  const parsed = updateMediaItemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update.", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const { id } = await context.params;
  const [existing] = await db
    .select({ id: mediaItems.id, status: mediaItems.status })
    .from(mediaItems)
    .where(and(eq(mediaItems.id, id), eq(mediaItems.userId, userId)))
    .limit(1);

  if (!existing || (existing.status === "removed" && !input.status)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const values: {
    status?: "watchlist" | "watched";
    watchlistNote?: string | null;
    reviewNote?: string | null;
    rating?: number | null;
    watchedAt?: Date | null;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (input.status) {
    values.status = input.status;
    if (input.status === "watched" && existing.status !== "watched") values.watchedAt = new Date();
    if (input.status === "watchlist") values.watchedAt = null;
  }
  if ("watchlistNote" in input) values.watchlistNote = input.watchlistNote ?? null;
  if ("reviewNote" in input) values.reviewNote = input.reviewNote ?? null;
  if ("rating" in input) values.rating = input.rating ?? null;

  const [item] = await db
    .update(mediaItems)
    .set(values)
    .where(and(eq(mediaItems.id, id), eq(mediaItems.userId, userId)))
    .returning();

  return NextResponse.json({ item });
}

export async function DELETE(request: Request, context: ItemRouteContext) {
  const userId = await getRequestUserId(request);
  if (!userId) return unauthorized();

  const { id } = await context.params;
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
