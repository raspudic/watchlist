import type { MediaItem } from "@/lib/library-cache";

export type MediaType = MediaItem["mediaType"];

export function posterUrl(path: string | null, size: "w92" | "w185" | "w342" = "w185") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

export function mediaLabel(type: MediaType, fallback = "Title") {
  if (type === "tv") return "Series";
  if (type === "movie") return "Movie";
  return fallback;
}

export function mediaMeta(releaseYear: number | string | null, type: MediaType) {
  return [releaseYear, mediaLabel(type)].filter(Boolean).join(" · ");
}

