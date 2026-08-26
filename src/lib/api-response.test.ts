import { describe, expect, it } from "vitest";

import {
  friendlySearchLimitMessage,
  isRateLimitError,
  readApiJson,
} from "./api-response";

describe("readApiJson", () => {
  it("preserves machine-readable rate-limit details", async () => {
    const response = Response.json(
      {
        error: "Slow down.",
        code: "RATE_LIMITED",
        reason: "tmdb_account_burst",
        retryAfter: 7,
      },
      { status: 429, headers: { "Retry-After": "7" } },
    );

    const error = await readApiJson(response).catch((caught) => caught);
    expect(isRateLimitError(error)).toBe(true);
    expect(error).toMatchObject({
      message: "Slow down.",
      reason: "tmdb_account_burst",
      retryAfter: 7,
    });
  });

  it("falls back to the Retry-After header", async () => {
    const response = Response.json(
      { error: "Busy.", code: "RATE_LIMITED", reason: "tmdb_upstream" },
      { status: 429, headers: { "Retry-After": "4" } },
    );

    const error = await readApiJson(response).catch((caught) => caught);
    expect(error).toMatchObject({ retryAfter: 4 });
  });
});

describe("friendlySearchLimitMessage", () => {
  it("distinguishes account and shared TMDB capacity", () => {
    expect(friendlySearchLimitMessage("account_read")).toContain("searching quickly");
    expect(friendlySearchLimitMessage("tmdb_account_minute")).toContain("searching quickly");
    expect(friendlySearchLimitMessage("tmdb_upstream")).toContain("TMDB is temporarily busy");
  });
});
