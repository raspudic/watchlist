"use client";

import { Check, LoaderCircle, LogOut, ShieldCheck, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

import { MIN_PASSWORD_LENGTH, validateNewPassword } from "@/lib/account-validation";
import { authClient } from "@/lib/auth-client";

export function AccountDialog({
  displayName,
  onClose,
  onSignOut,
  username,
}: {
  displayName: string;
  onClose: () => void;
  onSignOut: () => void;
  username: string;
}) {
  const currentPasswordRef = useRef<HTMLInputElement>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", closeOnEscape);
    document.body.classList.add("panel-open");
    currentPasswordRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.classList.remove("panel-open");
    };
  }, [onClose]);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess(false);

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
    setSuccess(true);
  }

  return (
    <div className="account-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <section aria-labelledby="account-title" aria-modal="true" className="account-dialog" role="dialog">
        <div className="account-dialog-header">
          <div>
            <p className="eyebrow">Account</p>
            <h2 id="account-title">{displayName}</h2>
            <p>@{username}</p>
          </div>
          <button className="panel-close" onClick={onClose} type="button"><X size={19} /><span className="sr-only">Close</span></button>
        </div>

        <form className="account-form" onSubmit={changePassword}>
          <div className="account-section-heading">
            <ShieldCheck aria-hidden="true" size={18} />
            <div><h3>Change password</h3><p>Changing it signs out your other devices.</p></div>
          </div>

          <label className="field-label" htmlFor="current-password">Current password</label>
          <input
            autoComplete="current-password"
            className="text-input"
            id="current-password"
            onChange={(event) => setCurrentPassword(event.target.value)}
            ref={currentPasswordRef}
            required
            type="password"
            value={currentPassword}
          />

          <label className="field-label" htmlFor="account-new-password">New password</label>
          <input
            autoComplete="new-password"
            className="text-input"
            id="account-new-password"
            maxLength={128}
            minLength={MIN_PASSWORD_LENGTH}
            onChange={(event) => setNewPassword(event.target.value)}
            required
            type="password"
            value={newPassword}
          />
          <p className="field-help">Use {MIN_PASSWORD_LENGTH} or more characters.</p>

          <label className="field-label" htmlFor="account-confirm-password">Verify new password</label>
          <input
            autoComplete="new-password"
            className="text-input"
            id="account-confirm-password"
            maxLength={128}
            minLength={MIN_PASSWORD_LENGTH}
            onChange={(event) => setConfirmation(event.target.value)}
            required
            type="password"
            value={confirmation}
          />

          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {success ? <p className="form-success" role="status"><Check size={15} /> Password changed. Other sessions were signed out.</p> : null}

          <button className="primary-button account-save" disabled={pending} type="submit">
            {pending ? <LoaderCircle aria-hidden="true" className="spin" size={17} /> : null}
            {pending ? "Updating…" : "Update password"}
          </button>
        </form>

        <button className="account-signout" onClick={onSignOut} type="button"><LogOut size={16} /> Sign out</button>
      </section>
    </div>
  );
}
