import { describe, expect, it } from "vitest";

import {
  createInvitationToken,
  hashInvitationToken,
  invitationExpiresAt,
  invitationStatus,
  normalizeInvitationEmail,
} from "@/lib/invitations";

describe("invitation helpers", () => {
  it("normalizes email and stores only a deterministic token hash", () => {
    expect(normalizeInvitationEmail(" Friend@Example.COM ")).toBe("friend@example.com");
    const token = createInvitationToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashInvitationToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashInvitationToken(token)).not.toContain(token);
  });

  it("expires invitations seven days after creation", () => {
    const now = new Date("2026-08-19T10:00:00Z");
    expect(invitationExpiresAt(now).toISOString()).toBe("2026-08-26T10:00:00.000Z");
  });

  it("reports terminal states before expiration", () => {
    const now = new Date("2026-08-19T10:00:00Z");
    const future = new Date("2026-08-20T10:00:00Z");
    const past = new Date("2026-08-18T10:00:00Z");
    expect(invitationStatus({ acceptedAt: null, revokedAt: null, expiresAt: future }, now)).toBe("pending");
    expect(invitationStatus({ acceptedAt: null, revokedAt: null, expiresAt: past }, now)).toBe("expired");
    expect(invitationStatus({ acceptedAt: now, revokedAt: null, expiresAt: past }, now)).toBe("accepted");
    expect(invitationStatus({ acceptedAt: null, revokedAt: now, expiresAt: future }, now)).toBe("revoked");
  });
});
