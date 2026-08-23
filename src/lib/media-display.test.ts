import { describe, expect, it } from "vitest";

import {
  mediaMeta,
  watchedChipLabel,
  watchedDateStamp,
  watchedDateValue,
  watchedLabel,
} from "@/lib/media-display";

/* Built from local parts on both sides so the assertions hold in any zone. */
const now = new Date(2026, 7, 24, 12, 0, 0);

function isoOn(year: number, month: number, day: number) {
  return new Date(year, month, day, 12, 0, 0).toISOString();
}

describe("watchedLabel", () => {
  it("says today and yesterday in words", () => {
    expect(watchedLabel(isoOn(2026, 7, 24), now)).toBe("Today");
    expect(watchedLabel(isoOn(2026, 7, 23), now)).toBe("Yesterday");
  });

  it("dates anything older, and adds the year only once it stops being obvious", () => {
    expect(watchedLabel(isoOn(2026, 7, 4), now)).toBe("4 Aug");
    expect(watchedLabel(isoOn(2024, 10, 3), now)).toBe("3 Nov 2024");
  });

  it("has nothing to say about a title with no watched date", () => {
    expect(watchedLabel(null, now)).toBeNull();
    expect(watchedLabel("not a date", now)).toBeNull();
  });
});

describe("watchedChipLabel", () => {
  it("reads as a sentence in every form", () => {
    expect(watchedChipLabel(isoOn(2026, 7, 24), now)).toBe("Watched today");
    expect(watchedChipLabel(isoOn(2026, 7, 23), now)).toBe("Watched yesterday");
    expect(watchedChipLabel(isoOn(2026, 7, 4), now)).toBe("Watched 4 Aug");
  });

  it("invites the date when there is none", () => {
    expect(watchedChipLabel(null, now)).toBe("Add the date");
  });
});

describe("watchedDateValue and watchedDateStamp", () => {
  it("round-trips a picked day without sliding across midnight", () => {
    const stamp = watchedDateStamp("2026-08-20", now);
    expect(stamp).not.toBeNull();
    expect(watchedDateValue(stamp)).toBe("2026-08-20");
  });

  it("never resolves today to a time still to come", () => {
    const morning = new Date(2026, 7, 24, 9, 0, 0);
    const stamp = watchedDateStamp("2026-08-24", morning);
    expect(stamp).toBe(morning.toISOString());
    expect(watchedDateValue(stamp)).toBe("2026-08-24");
  });

  it("rejects an incomplete date", () => {
    expect(watchedDateStamp("2026-08", now)).toBeNull();
    expect(watchedDateStamp("", now)).toBeNull();
  });
});

describe("mediaMeta", () => {
  it("keeps the watchlist line to the title's own facts", () => {
    expect(mediaMeta(2023, "movie")).toBe("2023 · Movie");
  });

  it("adds when you saw it once there is a watched date", () => {
    expect(mediaMeta(2023, "movie", isoOn(2026, 7, 24))).toBe("2023 · Movie · Today");
  });
});
