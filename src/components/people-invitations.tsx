"use client";

import { Check, Clipboard, RotateCcw, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";

export type InvitationSummary = {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  status: "pending" | "accepted" | "expired" | "revoked";
};

const STATUS_LABEL: Record<InvitationSummary["status"], string> = {
  pending: "Pending",
  accepted: "Joined",
  expired: "Expired",
  revoked: "Revoked",
};

function invitationMeta(invitation: InvitationSummary) {
  switch (invitation.status) {
    case "accepted":
      return `Joined ${new Date(invitation.acceptedAt!).toLocaleString()}`;
    case "revoked":
      return `Revoked ${new Date(invitation.revokedAt!).toLocaleString()}`;
    case "expired":
      return `Expired ${new Date(invitation.expiresAt).toLocaleString()}`;
    default:
      return `Created ${new Date(invitation.createdAt).toLocaleString()}`;
  }
}

export function PeopleInvitations({ initialInvitations }: { initialInvitations: InvitationSummary[] }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [invitations, setInvitations] = useState(initialInvitations);
  const [invitationUrl, setInvitationUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setInvitationUrl("");
    setPending(true);

    const response = await fetch("/api/admin/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = await response.json() as {
      error?: string;
      invitation?: InvitationSummary;
      invitationUrl?: string;
    };

    if (!response.ok || !body.invitation || !body.invitationUrl) {
      setError(body.error ?? "Could not create the invitation.");
      setPending(false);
      return;
    }

    setInvitations((current) => [
      body.invitation!,
      ...current.map((item) => item.email === body.invitation!.email && item.status === "pending"
        ? { ...item, status: "revoked" as const, revokedAt: new Date().toISOString() }
        : item),
    ]);
    setInvitationUrl(body.invitationUrl);
    setEmail("");
    setPending(false);
  }

  async function copyInvitation() {
    await navigator.clipboard.writeText(invitationUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function revokeInvitation(id: string) {
    const response = await fetch(`/api/admin/invitations/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) {
      setError("Could not revoke the invitation.");
      return;
    }

    setInvitations((current) => current.map((item) => item.id === id
      ? { ...item, status: "revoked", revokedAt: new Date().toISOString() }
      : item));
  }

  return (
    <div className="people-page">
      <header className="people-heading">
        <p className="eyebrow">Admins only</p>
        <h1>People</h1>
        <p>Later is invite-only. Links last seven days and work once.</p>
      </header>

      <section className="people-card">
        <h2>Invite someone</h2>
        <form className="invite-form" onSubmit={createInvitation}>
          <div className="invite-form-row">
            <TextField
              autoCapitalize="none"
              autoComplete="email"
              id="invite-email"
              label="Friend's email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
            <Button loading={pending} loadingLabel="Creating…" type="submit">Create link</Button>
          </div>
        </form>
        {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
        {invitationUrl ? (
          <div className="invite-link-result" role="status">
            <div><strong>Invitation created</strong><p>This link is shown only now.</p></div>
            <div className="invite-link-field">
              <code>{invitationUrl}</code>
              <Button onClick={copyInvitation} size="sm" type="button" variant="ghost">
                {copied ? <Check aria-hidden="true" size={16} /> : <Clipboard aria-hidden="true" size={16} />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="people-card">
        <h2>Invitations</h2>
        {invitations.length === 0 ? <p className="people-empty">No invitations yet.</p> : (
          <div className="invitation-list">
            {invitations.map((invitation) => (
              <article className="invitation-row" key={invitation.id}>
                <div>
                  <strong>{invitation.email}</strong>
                  <p>{invitationMeta(invitation)}</p>
                </div>
                <Badge tone={invitation.status === "pending" ? "accent" : "neutral"} uppercase>
                  {STATUS_LABEL[invitation.status]}
                </Badge>
                {invitation.status === "pending" ? (
                  <IconButton label="Revoke invitation" onClick={() => revokeInvitation(invitation.id)}>
                    <Trash2 aria-hidden="true" size={16} />
                  </IconButton>
                ) : <RotateCcw aria-hidden="true" className="invitation-history-icon" size={15} />}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
