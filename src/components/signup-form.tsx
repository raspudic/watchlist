"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { MIN_PASSWORD_LENGTH, validateNewPassword } from "@/lib/account-validation";

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
      <label className="field-label" htmlFor="new-username">Username</label>
      <input
        autoCapitalize="none"
        autoComplete="username"
        autoCorrect="off"
        className="text-input"
        id="new-username"
        maxLength={30}
        minLength={3}
        name="username"
        onChange={(event) => setUsername(event.target.value)}
        pattern="[A-Za-z0-9._]+"
        required
        value={username}
      />
      <p className="field-help">Letters, numbers, dots, and underscores.</p>

      <label className="field-label" htmlFor="display-name">Display name <span className="label-optional">Optional</span></label>
      <input
        autoComplete="name"
        className="text-input"
        id="display-name"
        maxLength={50}
        name="name"
        onChange={(event) => setDisplayName(event.target.value)}
        placeholder="Leave blank to use your username"
        value={displayName}
      />

      <label className="field-label" htmlFor="new-email">Email</label>
      <input
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect="off"
        className="text-input"
        id="new-email"
        name="email"
        readOnly
        required
        type="email"
        value={email}
      />

      <label className="field-label" htmlFor="new-password">Password</label>
      <input
        autoComplete="new-password"
        className="text-input"
        id="new-password"
        maxLength={128}
        minLength={MIN_PASSWORD_LENGTH}
        name="new-password"
        onChange={(event) => setPassword(event.target.value)}
        required
        type="password"
        value={password}
      />
      <p className="field-help">Use {MIN_PASSWORD_LENGTH} or more characters. Passphrases and password managers work well.</p>

      <label className="field-label" htmlFor="confirm-password">Verify password</label>
      <input
        autoComplete="new-password"
        className="text-input"
        id="confirm-password"
        maxLength={128}
        minLength={MIN_PASSWORD_LENGTH}
        name="confirm-password"
        onChange={(event) => setConfirmation(event.target.value)}
        required
        type="password"
        value={confirmation}
      />

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <button className="primary-button login-button" disabled={pending} type="submit">
        {pending ? <LoaderCircle aria-hidden="true" className="spin" size={17} /> : null}
        {pending ? "Creating account…" : "Create account"}
      </button>
      <p className="auth-switch">Already have an account? <Link href="/login">Sign in</Link></p>
    </form>
  );
}
