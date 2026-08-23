import type { MediaItem } from "@/lib/library-cache";

export type MediaType = MediaItem["mediaType"];

export function posterUrl(path: string | null, size: "w92" | "w185" | "w342" = "w185") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

export function providerLogoUrl(path: string | null, size: "w45" | "w92" = "w92") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

export function mediaLabel(type: MediaType, fallback = "Title") {
  if (type === "tv") return "Series";
  if (type === "movie") return "Movie";
  return fallback;
}

export function mediaMeta(
  releaseYear: number | string | null,
  type: MediaType,
  watchedAt?: string | null,
) {
  return [releaseYear, mediaLabel(type), watchedAt ? watchedLabel(watchedAt) : null]
    .filter(Boolean)
    .join(" · ");
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

/* Recent days read better as words; anything older gets a date, and the year
   only appears once it stops being obvious. */
export function watchedLabel(watchedAt: string | null, now = new Date()) {
  if (!watchedAt) return null;

  const watched = new Date(watchedAt);
  if (Number.isNaN(watched.getTime())) return null;

  const days = Math.round((startOfDay(now) - startOfDay(watched)) / DAY_MS);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";

  return watched.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(watched.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

export function watchedChipLabel(watchedAt: string | null, now = new Date()) {
  const label = watchedLabel(watchedAt, now);
  if (!label) return "Add the date";
  return `Watched ${label === "Today" || label === "Yesterday" ? label.toLowerCase() : label}`;
}

/* Value for a native date input, which speaks local calendar days. */
export function watchedDateValue(watchedAt: string | null) {
  if (!watchedAt) return "";

  const watched = new Date(watchedAt);
  if (Number.isNaN(watched.getTime())) return "";

  const pad = (value: number) => String(value).padStart(2, "0");
  return `${watched.getFullYear()}-${pad(watched.getMonth() + 1)}-${pad(watched.getDate())}`;
}

/* Midday keeps a picked day from sliding either side of midnight once it is
   stored as an instant, and today never resolves to a time still to come. */
export function watchedDateStamp(value: string, now = new Date()) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;

  const picked = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (Number.isNaN(picked.getTime())) return null;

  return new Date(Math.min(picked.getTime(), now.getTime())).toISOString();
}

