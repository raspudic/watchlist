import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: {} }));

import { resolveWatchedOn, watchedOnFromInstant } from "@/lib/watch-events";

describe("resolveWatchedOn", () => {
  const now = new Date("2026-09-01T23:30:00.000Z");

  it("trusts the day the browser says it is showing", () => {
    /* An hour before midnight in UTC is already tomorrow in Auckland, which is
       exactly why the calendar day is not derived from the server clock. */
    expect(resolveWatchedOn({ watchedOn: "2026-09-02" }, null, now)).toBe("2026-09-02");
  });

  it("falls back to the instant the request carried", () => {
    expect(resolveWatchedOn({ watchedAt: "2026-08-20T12:00:00.000Z" }, null, now)).toBe("2026-08-20");
  });

  it("falls back to the date the title already holds", () => {
    expect(resolveWatchedOn({}, new Date("2026-07-04T12:00:00.000Z"), now)).toBe("2026-07-04");
  });

  it("falls back to today when a title has never been watched", () => {
    expect(resolveWatchedOn({}, null, now)).toBe("2026-09-01");
  });

  it("reads an instant as its UTC calendar day", () => {
    expect(watchedOnFromInstant(new Date("2026-02-28T00:00:00.000Z"))).toBe("2026-02-28");
  });
});
