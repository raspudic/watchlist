import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { validateStateChangingApiRequest } from "@/lib/api-request-security";

function mutationRequest(
  origin: string | null = "https://watchlist.example",
  contentType: string | null = "application/json",
) {
  const headers = new Headers();
  if (origin) headers.set("Origin", origin);
  if (contentType) headers.set("Content-Type", contentType);

  return new Request("https://watchlist.example/api/items", {
    method: "POST",
    headers,
    body: "{}",
  });
}

beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("validateStateChangingApiRequest", () => {
  it("accepts same-origin JSON requests", () => {
    expect(validateStateChangingApiRequest(mutationRequest())).toBeNull();
    expect(
      validateStateChangingApiRequest(
        mutationRequest("https://watchlist.example", "application/json; charset=utf-8"),
      ),
    ).toBeNull();
  });

  it("rejects missing, malformed, and cross-origin Origin headers", async () => {
    for (const origin of [null, "not a URL", "https://attacker.example"]) {
      const response = validateStateChangingApiRequest(mutationRequest(origin));

      expect(response?.status).toBe(403);
      await expect(response?.json()).resolves.toEqual({
        error: "Request origin is not allowed.",
      });
    }
  });

  it("uses the configured public URL behind a reverse proxy", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://watchlist.example");
    const request = new Request("http://web:3000/api/items", {
      method: "POST",
      headers: {
        Origin: "https://watchlist.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    });

    expect(validateStateChangingApiRequest(request)).toBeNull();
  });

  it("fails closed when the configured public URL is invalid", () => {
    vi.stubEnv("BETTER_AUTH_URL", "not a URL");

    expect(validateStateChangingApiRequest(mutationRequest())?.status).toBe(403);
  });

  it("rejects non-JSON content types", async () => {
    for (const contentType of [null, "text/plain", "application/x-www-form-urlencoded"]) {
      const response = validateStateChangingApiRequest(
        mutationRequest("https://watchlist.example", contentType),
      );

      expect(response?.status).toBe(415);
      await expect(response?.json()).resolves.toEqual({
        error: "Content-Type must be application/json.",
      });
    }
  });
});
