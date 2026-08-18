import { describe, expect, it } from "vitest";

import { lifecycleCutoffs } from "@/lib/lifecycle-policy";

describe("lifecycleCutoffs", () => {
  it("retains terminal invitations for 30 days and limiter rows for 24 hours", () => {
    const cutoffs = lifecycleCutoffs(new Date("2026-08-19T12:00:00.000Z"));

    expect(cutoffs.terminalInvitation.toISOString()).toBe("2026-07-20T12:00:00.000Z");
    expect(new Date(cutoffs.rateLimit).toISOString()).toBe("2026-08-18T12:00:00.000Z");
  });
});
