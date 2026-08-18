import { describe, expect, it } from "vitest";

import { getSecurityHeaders } from "@/lib/security-headers";

function asRecord(isDevelopment: boolean) {
  return Object.fromEntries(
    getSecurityHeaders(isDevelopment).map(({ key, value }) => [key, value]),
  );
}

describe("getSecurityHeaders", () => {
  it("returns the production browser security policy", () => {
    const headers = asRecord(false);

    expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(headers["Content-Security-Policy"]).toContain(
      "img-src 'self' blob: data: https://image.tmdb.org",
    );
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["Content-Security-Policy"]).toContain("upgrade-insecure-requests");
    expect(headers["Content-Security-Policy"]).not.toContain("'unsafe-eval'");
    expect(headers["Strict-Transport-Security"]).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
  });

  it("allows development tooling without enabling HSTS", () => {
    const headers = asRecord(true);

    expect(headers["Content-Security-Policy"]).toContain("'unsafe-eval'");
    expect(headers["Content-Security-Policy"]).toContain("connect-src 'self' ws: wss:");
    expect(headers["Content-Security-Policy"]).not.toContain("upgrade-insecure-requests");
    expect(headers["Strict-Transport-Security"]).toBeUndefined();
  });
});
