import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { mediaItems, watchEvents } from "@/lib/db/schema";

/** Either the pool or an open transaction: every write here belongs in one. */
export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

type MediaItemRow = typeof mediaItems.$inferSelect;

/** The UTC calendar day of an instant, which is how a stamped date is stored. */
export function watchedOnFromInstant(value: Date) {
  return value.toISOString().slice(0, 10);
}

/**
 * The browser sends the day it is actually showing, because only it knows the
 * reader's calendar. Everything else is a fallback for older clients.
 */
export function resolveWatchedOn(
  input: { watchedOn?: string | null; watchedAt?: string | null },
  watchedAt: Date | null,
  now = new Date(),
) {
  if (input.watchedOn) return input.watchedOn;
  if (input.watchedAt) return watchedOnFromInstant(new Date(input.watchedAt));
  return watchedOnFromInstant(watchedAt ?? now);
}

export async function latestWatchEvent(executor: Executor, mediaItemId: string) {
  const [event] = await executor
    .select()
    .from(watchEvents)
    .where(eq(watchEvents.mediaItemId, mediaItemId))
    .orderBy(desc(watchEvents.watchedOn), desc(watchEvents.createdAt), desc(watchEvents.id))
    .limit(1);
  return event ?? null;
}

/**
 * Records one viewing. The id is supplied by the caller — the browser generates
 * it for a rewatch — so a retried request settles on the same occurrence
 * instead of logging a second one.
 */
export async function recordWatchEvent(
  executor: Executor,
  event: {
    id: string;
    userId: string;
    mediaItemId: string;
    watchedOn: string;
    rating: number | null;
  },
) {
  const [created] = await executor
    .insert(watchEvents)
    .values(event)
    .onConflictDoNothing({ target: watchEvents.id })
    .returning();
  return created ?? null;
}

/**
 * Applies an edit to the occurrence the library is showing. A watched title
 * with no history — a row the backfill never saw — gets its first event here
 * rather than silently losing the edit.
 */
export async function syncLatestWatchEvent(
  executor: Executor,
  item: MediaItemRow,
  patch: { watchedOn?: string; rating?: number | null },
  now = new Date(),
) {
  const latest = await latestWatchEvent(executor, item.id);

  if (!latest) {
    if (item.status !== "watched") return null;
    return recordWatchEvent(executor, {
      id: crypto.randomUUID(),
      userId: item.userId,
      mediaItemId: item.id,
      watchedOn: patch.watchedOn ?? watchedOnFromInstant(item.watchedAt ?? now),
      rating: patch.rating === undefined ? item.rating : patch.rating,
    });
  }

  const values: { watchedOn?: string; rating?: number | null; updatedAt: Date } = { updatedAt: now };
  if (patch.watchedOn) values.watchedOn = patch.watchedOn;
  if (patch.rating !== undefined) values.rating = patch.rating;

  const [updated] = await executor
    .update(watchEvents)
    .set(values)
    .where(eq(watchEvents.id, latest.id))
    .returning();
  return updated ?? null;
}

/** Newest first, and scoped by account: history is never read across users. */
export async function listWatchEvents(userId: string, mediaItemId: string) {
  return db
    .select({
      id: watchEvents.id,
      watchedOn: watchEvents.watchedOn,
      rating: watchEvents.rating,
      createdAt: watchEvents.createdAt,
    })
    .from(watchEvents)
    .where(and(eq(watchEvents.userId, userId), eq(watchEvents.mediaItemId, mediaItemId)))
    .orderBy(desc(watchEvents.watchedOn), desc(watchEvents.createdAt));
}
