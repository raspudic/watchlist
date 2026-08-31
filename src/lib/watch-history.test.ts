import { describe, expect, it, vi } from "vitest";

import { watchEventDateLabel } from "@/lib/watch-history";

vi.mock("server-only", () => ({}));

describe("watchEventDateLabel", () => {
  const now = new Date(2026, 8, 1);

  it("reads a stored day as a calendar day, not as UTC midnight", () => {
    expect(watchEventDateLabel("2026-08-12", now)).toBe("12 Aug");
  });

  it("adds the year once it stops being obvious", () => {
    expect(watchEventDateLabel("2024-01-03", now)).toBe("3 Jan 2024");
  });

  it("returns anything unparseable unchanged", () => {
    expect(watchEventDateLabel("not-a-date", now)).toBe("not-a-date");
  });
});
