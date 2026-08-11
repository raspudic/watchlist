import { describe, expect, it } from "vitest";

import { shouldDismissSheet } from "@/lib/sheet-dismiss";

describe("shouldDismissSheet", () => {
  it("dismisses deliberate pulls and quick downward flicks", () => {
    expect(shouldDismissSheet(112, 0.1)).toBe(true);
    expect(shouldDismissSheet(40, 0.6)).toBe(true);
  });

  it("snaps back after a small or upward gesture", () => {
    expect(shouldDismissSheet(70, 0.2)).toBe(false);
    expect(shouldDismissSheet(0, -0.8)).toBe(false);
  });
});
