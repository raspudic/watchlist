"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { authClient } from "@/lib/auth-client";

export function ProfileCard({ displayName, username }: { displayName: string; username: string }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(displayName);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const nextName = name.trim() || username;
    setPending(true);
    const result = await authClient.updateUser({ name: nextName });

    if (result.error) {
      setError("Could not update your display name.");
      setPending(false);
      return;
    }

    setName(nextName);
    setPending(false);
    toast.add({ title: "Display name updated." });
    router.refresh();
  }

  return (
    <section className="settings-card">
      <h2>Profile</h2>
      <p>How you appear in the account menu.</p>
      <div className="settings-profile">
        <span className="settings-avatar" aria-hidden="true">{(name || username).slice(0, 1).toUpperCase()}</span>
        <form onSubmit={save}>
          <TextField
            autoComplete="name"
            description={`Leave blank to use @${username}.`}
            error={error}
            label="Display name"
            maxLength={50}
            onChange={(event) => setName(event.target.value)}
            optional
            placeholder={`@${username}`}
            value={name}
          />
          <div className="settings-actions">
            <Button loading={pending} type="submit" variant="secondary">Save</Button>
          </div>
        </form>
      </div>
    </section>
  );
}
