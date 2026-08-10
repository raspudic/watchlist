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

export const updateMediaItemSchema = z
  .object({
    status: itemStatusSchema.optional(),
    watchlistNote: nullableShortText,
    reviewNote: nullableShortText,
    rating: z.number().int().min(1).max(10).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one value to update.",
  });

export type CreateMediaItemInput = z.infer<typeof createMediaItemSchema>;
