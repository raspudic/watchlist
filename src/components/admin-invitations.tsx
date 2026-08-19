"use client";

import { Check, Clipboard, LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";

export type InvitationSummary = {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  status: "pending" | "accepted" | "expired" | "revoked";
};

export function AdminInvitations({ initialInvitations }: { initialInvitations: InvitationSummary[] }) {
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
    <div className="admin-invitations">
      <section className="admin-card">
        <div className="section-heading">
          <div><p className="eyebrow">Access</p><h1>Invitations</h1></div>
        </div>
        <p className="admin-intro">Create a seven-day, single-use link and send it through a trusted channel.</p>
        <form className="invite-form" onSubmit={createInvitation}>
          <label className="field-label" htmlFor="invite-email">Friend&apos;s email</label>
          <div className="invite-form-row">
            <input
              autoCapitalize="none"
              autoComplete="email"
              className="text-input"
              id="invite-email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
            <button className="primary-button" disabled={pending} type="submit">
              {pending ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : null}
              Create link
            </button>
          </div>
        </form>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {invitationUrl ? (
          <div className="invite-link-result" role="status">
            <div><strong>Invitation created</strong><p>This link is shown only now.</p></div>
            <div className="invite-link-field">
              <code>{invitationUrl}</code>
              <button className="invite-copy-button" onClick={copyInvitation} type="button">
                {copied ? <Check aria-hidden="true" size={16} /> : <Clipboard aria-hidden="true" size={16} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="admin-card">
        <div className="section-heading"><div><p className="eyebrow">History</p><h2>Recent invitations</h2></div></div>
        {invitations.length === 0 ? <p className="admin-empty">No invitations yet.</p> : (
          <div className="invitation-list">
            {invitations.map((invitation) => (
              <article className="invitation-row" key={invitation.id}>
                <div>
                  <strong>{invitation.email}</strong>
                  <p>Created {new Date(invitation.createdAt).toLocaleString()}</p>
                </div>
                <span className={`invitation-status ${invitation.status}`}>{invitation.status}</span>
                {invitation.status === "pending" ? (
                  <button className="icon-button" onClick={() => revokeInvitation(invitation.id)} title="Revoke invitation" type="button">
                    <Trash2 aria-hidden="true" size={16} /><span className="sr-only">Revoke invitation</span>
                  </button>
                ) : <RotateCcw aria-hidden="true" className="invitation-history-icon" size={15} />}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
