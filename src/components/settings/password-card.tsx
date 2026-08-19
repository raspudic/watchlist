"use client";

import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
import { useToast } from "@/components/ui/toast";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, validateNewPassword } from "@/lib/account-validation";
import { authClient } from "@/lib/auth-client";

export function PasswordCard() {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const passwordError = validateNewPassword(newPassword, confirmation);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setPending(true);
    const result = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });

    if (result.error) {
      setError(
        result.error.status === 429
          ? "Too many attempts. Please try again later."
          : result.error.code === "PASSWORD_COMPROMISED"
            ? "That password has appeared in a known data breach. Choose another one."
            : "Your current password was not accepted.",
      );
      setPending(false);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmation("");
    setPending(false);
    toast.add({ title: "Password changed. Other sessions were signed out." });
  }

  return (
    <section className="settings-card">
      <h2>Password</h2>
      <p>Changing it signs out your other devices.</p>
      <form className="settings-form" onSubmit={changePassword}>
        <PasswordField
          label="Current password"
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
          value={currentPassword}
        />
        <PasswordField
          autoComplete="new-password"
          description={`Use ${MIN_PASSWORD_LENGTH} or more characters.`}
          label="New password"
          maxLength={MAX_PASSWORD_LENGTH}
          minLength={MIN_PASSWORD_LENGTH}
          onChange={(event) => setNewPassword(event.target.value)}
          required
          value={newPassword}
        />
        <PasswordField
          autoComplete="new-password"
          label="Verify new password"
          maxLength={MAX_PASSWORD_LENGTH}
          minLength={MIN_PASSWORD_LENGTH}
          onChange={(event) => setConfirmation(event.target.value)}
          required
          value={confirmation}
        />
        {error ? <InlineMessage>{error}</InlineMessage> : null}
        <div className="settings-actions">
          <Button loading={pending} loadingLabel="Updating…" type="submit">Update password</Button>
        </div>
      </form>
    </section>
  );
}
