"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { CheckboxField, PasswordField, TextField } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";

export function LoginForm({ returnTo = "/watchlist" }: { returnTo?: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    const result = await authClient.signIn.username({ username, password, rememberMe });

    if (result.error) {
      setError(
        result.error.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : "That username or password is not correct.",
      );
      setPending(false);
      return;
    }

    router.replace(returnTo);
    router.refresh();
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <TextField
        autoCapitalize="none"
        autoComplete="username"
        autoCorrect="off"
        id="username"
        label="Username"
        name="username"
        onChange={(event) => setUsername(event.target.value)}
        required
        value={username}
      />

      <PasswordField
        autoComplete="current-password"
        id="password"
        label="Password"
        name="password"
        onChange={(event) => setPassword(event.target.value)}
        required
        value={password}
      />

      <div className="remember-me">
        <CheckboxField
          checked={rememberMe}
          label={
            <span className="remember-me-copy">
              <strong>Keep me signed in</strong>
              <small>
                {rememberMe
                  ? "Stay signed in for 30 days after your latest visit."
                  : "Otherwise, sign out when this browser closes or after 24 hours."}
              </small>
            </span>
          }
          onCheckedChange={setRememberMe}
        />
      </div>

      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

      <Button className="login-button" fullWidth loading={pending} loadingLabel="Signing in…" type="submit">
        Sign in
      </Button>
      <p className="auth-switch">Accounts are invitation-only.</p>
    </form>
  );
}
