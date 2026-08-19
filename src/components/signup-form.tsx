"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { MIN_PASSWORD_LENGTH, validateNewPassword } from "@/lib/account-validation";
import { Button } from "@/components/ui/button";
import { PasswordField, TextField } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";

export function SignupForm({
  email,
  invitationToken,
}: {
  email: string;
  invitationToken: string;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const passwordError = validateNewPassword(password, confirmation);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setPending(true);
    const normalizedUsername = username.trim();
    const response = await fetch("/api/invitations/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: invitationToken,
        name: displayName.trim(),
        password,
        username: normalizedUsername,
      }),
    });
    const result = await response.json() as { error?: string };

    if (!response.ok) {
      setError(
        response.status === 429
          ? "Too many account attempts. Please try again later."
          : result.error ?? "Could not create that account. Try a different username.",
      );
      setPending(false);
      return;
    }

    router.replace("/watchlist");
    router.refresh();
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <TextField
        autoCapitalize="none"
        autoComplete="username"
        autoCorrect="off"
        description="Letters, numbers, dots, and underscores."
        id="new-username"
        label="Username"
        maxLength={30}
        minLength={3}
        name="username"
        onChange={(event) => setUsername(event.target.value)}
        pattern="[A-Za-z0-9._]+"
        required
        value={username}
      />

      <TextField
        autoComplete="name"
        id="display-name"
        label="Display name"
        maxLength={50}
        name="name"
        onChange={(event) => setDisplayName(event.target.value)}
        optional
        placeholder="Leave blank to use your username"
        value={displayName}
      />

      <TextField
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect="off"
        id="new-email"
        label="Email"
        name="email"
        readOnly
        required
        type="email"
        value={email}
      />

      <PasswordField
        autoComplete="new-password"
        description={`Use ${MIN_PASSWORD_LENGTH} or more characters. Passphrases and password managers work well.`}
        id="new-password"
        label="Password"
        maxLength={128}
        minLength={MIN_PASSWORD_LENGTH}
        name="new-password"
        onChange={(event) => setPassword(event.target.value)}
        required
        value={password}
      />

      <PasswordField
        autoComplete="new-password"
        id="confirm-password"
        label="Verify password"
        maxLength={128}
        minLength={MIN_PASSWORD_LENGTH}
        name="confirm-password"
        onChange={(event) => setConfirmation(event.target.value)}
        required
        value={confirmation}
      />

      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

      <Button className="login-button" fullWidth loading={pending} loadingLabel="Creating account…" type="submit">
        Create account
      </Button>
      <p className="auth-switch">Already have an account? <Link href="/login">Sign in</Link></p>
    </form>
  );
}
