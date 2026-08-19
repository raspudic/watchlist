import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/operational-events", () => ({ logOperationalEvent: vi.fn() }));

import {
  API_RATE_LIMITS,
  consumeRateLimits,
  rateLimitResponse,
  type RateLimitStore,
} from "./api-rate-limit";
import { logOperationalEvent } from "./operational-events";

function memoryStore() {
  const counts = new Map<string, number>();
  const keys: string[] = [];
  const store: RateLimitStore = {
    async increment(key) {
      keys.push(key);
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return count;
    },
  };
  return { keys, store };
}

describe("consumeRateLimits", () => {
  it("shares counters across callers and blocks after the configured limit", async () => {
    const shared = memoryStore();
    const rule = [{ id: "test", limit: 2, windowSeconds: 10, reason: "account_read" as const }];

    await expect(consumeRateLimits("account-1", rule, { now: 1_000, store: shared.store }))
      .resolves.toEqual({ allowed: true });
    await expect(consumeRateLimits("account-1", rule, { now: 2_000, store: shared.store }))
      .resolves.toEqual({ allowed: true });
    await expect(consumeRateLimits("account-1", rule, { now: 2_500, store: shared.store }))
      .resolves.toEqual({ allowed: false, reason: "account_read", retryAfter: 8 });
  });

  it("uses independent fixed windows and scopes without putting account ids in keys", async () => {
    const shared = memoryStore();
    const rule = [{ id: "test", limit: 1, windowSeconds: 10, reason: "account_read" as const }];

    await expect(consumeRateLimits("private-account-id", rule, { now: 9_999, store: shared.store }))
      .resolves.toEqual({ allowed: true });
    await expect(consumeRateLimits("private-account-id", rule, { now: 10_000, store: shared.store }))
      .resolves.toEqual({ allowed: true });
    await expect(consumeRateLimits("another-account", rule, { now: 10_000, store: shared.store }))
      .resolves.toEqual({ allowed: true });

    expect(shared.keys).toHaveLength(3);
    expect(shared.keys.join(" ")).not.toContain("private-account-id");
    expect(new Set(shared.keys).size).toBe(3);
  });

  it("enforces the TMDB burst before the minute allowance", async () => {
    const shared = memoryStore();
    for (let request = 0; request < 10; request += 1) {
      await expect(consumeRateLimits("account-1", API_RATE_LIMITS.tmdbAccount, {
        now: 1_000,
        store: shared.store,
      })).resolves.toEqual({ allowed: true });
    }

    await expect(consumeRateLimits("account-1", API_RATE_LIMITS.tmdbAccount, {
      now: 1_000,
      store: shared.store,
    })).resolves.toEqual({
      allowed: false,
      reason: "tmdb_account_burst",
      retryAfter: 9,
    });
  });

  it("gives a bulk import its own TMDB budget instead of sharing the interactive one", async () => {
    const shared = memoryStore();
    for (let request = 0; request < 10; request += 1) {
      await consumeRateLimits("account-1", API_RATE_LIMITS.tmdbAccount, { now: 1_000, store: shared.store });
    }
    await expect(consumeRateLimits("account-1", API_RATE_LIMITS.tmdbAccount, { now: 1_000, store: shared.store }))
      .resolves.toMatchObject({ allowed: false });

    await expect(consumeRateLimits("account-1", API_RATE_LIMITS.tmdbBulkImport, { now: 1_000, store: shared.store }))
      .resolves.toEqual({ allowed: true });
  });

  it("covers a full 40-title bulk import before the burst tier trips", async () => {
    const shared = memoryStore();
    for (let request = 0; request < 40; request += 1) {
      await expect(consumeRateLimits("account-1", API_RATE_LIMITS.tmdbBulkImport, {
        now: 1_000,
        store: shared.store,
      })).resolves.toEqual({ allowed: true });
    }
  });

  it("gives a bulk write its own library budget instead of sharing the interactive one", async () => {
    const shared = memoryStore();
    for (let request = 0; request < 15; request += 1) {
      await consumeRateLimits("account-1", API_RATE_LIMITS.libraryWrite, { now: 1_000, store: shared.store });
    }
    await expect(consumeRateLimits("account-1", API_RATE_LIMITS.libraryWrite, { now: 1_000, store: shared.store }))
      .resolves.toMatchObject({ allowed: false });

    await expect(consumeRateLimits("account-1", API_RATE_LIMITS.libraryBulkWrite, { now: 1_000, store: shared.store }))
      .resolves.toEqual({ allowed: true });
  });

  it("covers a full 40-title bulk write before the burst tier trips", async () => {
    const shared = memoryStore();
    for (let request = 0; request < 40; request += 1) {
      await expect(consumeRateLimits("account-1", API_RATE_LIMITS.libraryBulkWrite, {
        now: 1_000,
        store: shared.store,
      })).resolves.toEqual({ allowed: true });
    }
  });
});

describe("rateLimitResponse", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a machine-readable 429 with Retry-After and a privacy-safe event", async () => {
    const response = rateLimitResponse({
      allowed: false,
      reason: "tmdb_application",
      retryAfter: 3,
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("3");
    await expect(response.json()).resolves.toMatchObject({
      code: "RATE_LIMITED",
      reason: "tmdb_application",
      retryAfter: 3,
    });
    expect(logOperationalEvent).toHaveBeenCalledWith("api_rate_limited", {
      reason: "tmdb_application",
      retryAfter: 3,
      status: 429,
    });
  });
});
