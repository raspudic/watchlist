/** One recorded viewing, as the browser sees it. */
export type WatchEventRecord = {
  id: string;
  watchedOn: string;
  rating: number | null;
  createdAt: string;
};

/**
 * A calendar day is formatted from its parts. Parsing "2026-08-12" as a date
 * would read it as UTC midnight and show the day before to anyone west of it.
 */
export function watchEventDateLabel(watchedOn: string, now = new Date()) {
  const [year, month, day] = watchedOn.split("-").map(Number);
  if (!year || !month || !day) return watchedOn;

  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(year === now.getFullYear() ? {} : { year: "numeric" }),
  });
}
