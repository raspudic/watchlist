export const TERMINAL_INVITATION_RETENTION_DAYS = 30;
export const RATE_LIMIT_RETENTION_HOURS = 24;

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const HOUR_IN_MS = 60 * 60 * 1000;

export function lifecycleCutoffs(now = new Date()) {
  return {
    terminalInvitation: new Date(
      now.getTime() - TERMINAL_INVITATION_RETENTION_DAYS * DAY_IN_MS,
    ),
    rateLimit: now.getTime() - RATE_LIMIT_RETENTION_HOURS * HOUR_IN_MS,
  };
}
