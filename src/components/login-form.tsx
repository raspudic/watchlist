"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    const result = await authClient.signIn.username({ username, password });

    if (result.error) {
      setError(
        result.error.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : "That username or password is not correct.",
      );
      setPending(false);
      return;
    }

    router.replace("/watchlist");
    router.refresh();
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label className="field-label" htmlFor="username">Username</label>
      <input
        autoCapitalize="none"
        autoComplete="username"
        autoCorrect="off"
        className="text-input"
        id="username"
        name="username"
        onChange={(event) => setUsername(event.target.value)}
        required
        value={username}
      />

      <label className="field-label" htmlFor="password">Password</label>
      <input
        autoComplete="current-password"
        className="text-input"
        id="password"
        name="password"
        onChange={(event) => setPassword(event.target.value)}
        required
        type="password"
        value={password}
      />

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <button className="primary-button login-button" disabled={pending} type="submit">
        {pending ? <LoaderCircle aria-hidden="true" className="spin" size={17} /> : null}
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="auth-switch">New here? <Link href="/signup">Create an account</Link></p>
    </form>
  );
}
