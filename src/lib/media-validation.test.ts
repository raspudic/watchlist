import { describe, expect, it } from "vitest";

import { createMediaItemSchema, updateMediaItemSchema } from "@/lib/media-validation";

describe("createMediaItemSchema", () => {
  it("accepts a normalized TMDB anime series", () => {
    const result = createMediaItemSchema.safeParse({
      provider: "tmdb",
      externalId: 1429,
      mediaType: "tv",
      title: "Attack on Titan",
      releaseYear: 2013,
      overview: "Humanity lives within walls.",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a simple custom title", () => {
    const result = createMediaItemSchema.safeParse({
      provider: "custom",
      mediaType: "other",
      title: "A film a friend mentioned",
    });

    expect(result.success).toBe(true);
  });

  it("rejects TMDB entries without an external identity", () => {
    const result = createMediaItemSchema.safeParse({
      provider: "tmdb",
      mediaType: "movie",
      title: "Incomplete title",
    });

    expect(result.success).toBe(false);
  });
});

describe("updateMediaItemSchema", () => {
  it("accepts watched without a rating", () => {
    expect(updateMediaItemSchema.safeParse({ status: "watched" }).success).toBe(true);
  });

  it("accepts ratings from 1 through 10", () => {
    expect(updateMediaItemSchema.safeParse({ rating: 1 }).success).toBe(true);
    expect(updateMediaItemSchema.safeParse({ rating: 10 }).success).toBe(true);
  });

  it("rejects out-of-range ratings and empty updates", () => {
    expect(updateMediaItemSchema.safeParse({ rating: 11 }).success).toBe(false);
    expect(updateMediaItemSchema.safeParse({}).success).toBe(false);
  });
});
