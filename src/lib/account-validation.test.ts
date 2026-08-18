import { describe, expect, it } from "vitest";

import {
  ACCOUNT_DELETION_CONFIRMATION,
  validateAccountDeletion,
  validateNewPassword,
} from "@/lib/account-validation";

describe("validateNewPassword", () => {
  it("accepts a matching passphrase of at least 8 characters", () => {
    expect(validateNewPassword("a long passphrase", "a long passphrase")).toBeNull();
  });

  it("rejects short and mismatched passwords", () => {
    expect(validateNewPassword("short", "short")).toBe("Use at least 8 characters.");
    expect(validateNewPassword("a long passphrase", "another passphrase")).toBe("The passwords do not match.");
  });
});

describe("validateAccountDeletion", () => {
  it("requires both the current password and exact irreversible confirmation", () => {
    expect(validateAccountDeletion("", ACCOUNT_DELETION_CONFIRMATION)).toBe("Enter your current password.");
    expect(validateAccountDeletion("current password", "delete")).toBe("Type DELETE to confirm.");
    expect(validateAccountDeletion("current password", ACCOUNT_DELETION_CONFIRMATION)).toBeNull();
  });
});
