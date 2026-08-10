import { and, desc, eq, ne, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getRequestUserId } from "@/lib/api-auth";
import { db } from "@/lib/db/client";
import { mediaItems } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const querySchema = z.string().trim().min(1).max(100);

export async function GET(request: Request) {
  const userId = await getRequestUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = querySchema.safeParse(new URL(request.url).searchParams.get("q") ?? "");
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter something to search for." }, { status: 400 });
  }

  const needle = parsed.data.toLocaleLowerCase();
  const matchesText = or(
    sql`position(${needle} in lower(${mediaItems.title})) > 0`,
    sql`position(${needle} in lower(coalesce(${mediaItems.originalTitle}, ''))) > 0`,
    sql`position(${needle} in lower(coalesce(${mediaItems.watchlistNote}, ''))) > 0`,
    sql`position(${needle} in lower(coalesce(${mediaItems.reviewNote}, ''))) > 0`,
  );

  const items = await db
    .select()
    .from(mediaItems)
    .where(
      and(
        eq(mediaItems.userId, userId),
        ne(mediaItems.status, "removed"),
        matchesText,
      ),
    )
    .orderBy(desc(mediaItems.updatedAt))
    .limit(50);

  return NextResponse.json({ items });
}
