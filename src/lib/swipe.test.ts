import { describe, expect, it } from "vitest";

import { getSwipeRelease } from "@/lib/swipe";

describe("getSwipeRelease", () => {
  it("closes a small swipe and reveals the tray after a short swipe", () => {
    expect(getSwipeRelease(-30, 320)).toBe("close");
    expect(getSwipeRelease(-80, 320)).toBe("reveal");
  });

  it("removes only after a deliberate swipe across most of the row", () => {
    expect(getSwipeRelease(-207, 320)).toBe("reveal");
    expect(getSwipeRelease(-208, 320)).toBe("remove");
  });
});
