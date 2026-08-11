import { describe, expect, it } from "vitest";

import { validateNewPassword } from "@/lib/account-validation";

describe("validateNewPassword", () => {
  it("accepts a matching passphrase of at least 8 characters", () => {
    expect(validateNewPassword("a long passphrase", "a long passphrase")).toBeNull();
  });

  it("rejects short and mismatched passwords", () => {
    expect(validateNewPassword("short", "short")).toBe("Use at least 8 characters.");
    expect(validateNewPassword("a long passphrase", "another passphrase")).toBe("The passwords do not match.");
  });
});
