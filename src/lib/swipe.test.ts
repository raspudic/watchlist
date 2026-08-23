import { describe, expect, it } from "vitest";

import { getSwipeRelease } from "@/lib/swipe";

describe("getSwipeRelease", () => {
  it("closes a small swipe and reveals a tray after a short swipe", () => {
    expect(getSwipeRelease(-30, 320)).toBe("close");
    expect(getSwipeRelease(30, 320)).toBe("close");
    expect(getSwipeRelease(-80, 320)).toBe("reveal-remove");
    expect(getSwipeRelease(80, 320)).toBe("reveal-watched");
  });

  it("commits only after a deliberate swipe across most of the row", () => {
    expect(getSwipeRelease(-207, 320)).toBe("reveal-remove");
    expect(getSwipeRelease(-208, 320)).toBe("remove");
    expect(getSwipeRelease(207, 320)).toBe("reveal-watched");
    expect(getSwipeRelease(208, 320)).toBe("watched");
  });

  it("never commits before the row has been measured", () => {
    expect(getSwipeRelease(-900, 0)).toBe("reveal-remove");
    expect(getSwipeRelease(900, 0)).toBe("reveal-watched");
  });
});
