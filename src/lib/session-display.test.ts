import { describe, expect, it } from "vitest";

import { describeSession, maskIpAddress } from "@/lib/session-display";

describe("session display helpers", () => {
  it("describes common browsers and devices without returning the full user agent", () => {
    expect(describeSession("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1")).toBe("Safari on iPhone");
    expect(describeSession("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127.0.0.0 Safari/537.36")).toBe("Chrome on Windows");
    expect(describeSession(null)).toBe("Unknown browser");
  });

  it("masks network addresses before display", () => {
    expect(maskIpAddress("203.0.113.42")).toBe("203.0.x.x");
    expect(maskIpAddress("::ffff:192.0.2.15")).toBe("192.0.x.x");
    expect(maskIpAddress("2001:db8:1234:5678::1")).toBe("2001:db8:…");
    expect(maskIpAddress("127.0.0.1")).toBe("Local network");
    expect(maskIpAddress(null)).toBeNull();
  });
});
