import { z } from "zod";

const nullableShortText = z.string().trim().max(2_000).nullable().optional();

export const itemStatusSchema = z.enum(["watchlist", "watched"]);

const tmdbItemSchema = z.object({
  provider: z.literal("tmdb"),
  externalId: z.number().int().positive(),
  mediaType: z.enum(["movie", "tv"]),
  title: z.string().trim().min(1).max(500),
  originalTitle: z.string().trim().max(500).nullable().optional(),
  releaseYear: z.number().int().min(1888).max(3000).nullable().optional(),
  posterPath: z.string().trim().max(500).nullable().optional(),
  overview: z.string().trim().max(5_000).nullable().optional(),
});

const customItemSchema = z.object({
  provider: z.literal("custom"),
  mediaType: z.enum(["movie", "tv", "other"]).default("other"),
  title: z.string().trim().min(1).max(500),
  originalTitle: z.string().trim().max(500).nullable().optional(),
  releaseYear: z.number().int().min(1888).max(3000).nullable().optional(),
  overview: z.string().trim().max(5_000).nullable().optional(),
});

export const createMediaItemSchema = z
  .discriminatedUnion("provider", [tmdbItemSchema, customItemSchema])
  .and(
    z.object({
      watchlistNote: nullableShortText,
    }),
  );

/* A day of slack absorbs client clocks and time zones ahead of the server
   without accepting a date that is meaningfully in the future. */
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

export const updateMediaItemSchema = z
  .object({
    status: itemStatusSchema.optional(),
    watchlistNote: nullableShortText,
    reviewNote: nullableShortText,
    rating: z.number().int().min(1).max(10).nullable().optional(),
    watchedAt: z.iso.datetime().nullable().optional(),
    pinned: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one value to update.",
  })
  .refine(
    (value) => !value.watchedAt || Date.parse(value.watchedAt) <= Date.now() + FUTURE_TOLERANCE_MS,
    { message: "A title cannot be watched in the future.", path: ["watchedAt"] },
  );

export type CreateMediaItemInput = z.infer<typeof createMediaItemSchema>;
