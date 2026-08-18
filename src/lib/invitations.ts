import { createHash, randomBytes } from "node:crypto";

export const INVITATION_LIFETIME_DAYS = 7;

export function normalizeInvitationEmail(email: string) {
  return email.trim().toLocaleLowerCase();
}

export function createInvitationToken() {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function invitationExpiresAt(now = new Date()) {
  return new Date(now.getTime() + INVITATION_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
}

export function invitationStatus(invitation: {
  acceptedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
}, now = new Date()) {
  if (invitation.acceptedAt) return "accepted" as const;
  if (invitation.revokedAt) return "revoked" as const;
  if (invitation.expiresAt <= now) return "expired" as const;
  return "pending" as const;
}
