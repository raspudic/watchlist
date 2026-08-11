"use client";

import { Check, LoaderCircle, LogOut, Monitor, Moon, Palette, ShieldCheck, Sun, UserRound, X } from "lucide-react";
import { FormEvent, useEffect, useState, useSyncExternalStore } from "react";

import { usePullToDismiss } from "@/hooks/use-pull-to-dismiss";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "@/lib/account-validation";
import { authClient } from "@/lib/auth-client";

type ThemePreference = "light" | "system" | "dark";

const themes: Array<{ icon: typeof Sun; label: string; value: ThemePreference }> = [
  { icon: Sun, label: "Light", value: "light" },
  { icon: Monitor, label: "System", value: "system" },
  { icon: Moon, label: "Dark", value: "dark" },
];

function getThemePreference(): ThemePreference {
  const current = document.documentElement.dataset.theme;
  return current === "light" || current === "dark" || current === "system" ? current : "system";
}

function getServerThemePreference(): ThemePreference {
  return "system";
}

function subscribeToThemePreference(onChange: () => void) {
  window.addEventListener("watchlist-theme-change", onChange);
  return () => window.removeEventListener("watchlist-theme-change", onChange);
}

function setThemePreference(theme: ThemePreference) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("watchlist-theme", theme);
  window.dispatchEvent(new Event("watchlist-theme-change"));
}

export function AccountDialog({
  displayName,
  onClose,
  onDisplayNameChange,
  onSignOut,
  username,
}: {
  displayName: string;
  onClose: () => void;
  onDisplayNameChange: (name: string) => void;
  onSignOut: () => void;
  username: string;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [profileName, setProfileName] = useState(displayName);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profilePending, setProfilePending] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);
  const theme = useSyncExternalStore(subscribeToThemePreference, getThemePreference, getServerThemePreference);
  const sheet = usePullToDismiss(onClose);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", closeOnEscape);
    document.body.classList.add("panel-open");
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

  async function changeDisplayName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError("");
    setProfileSuccess(false);

    const nextName = profileName.trim() || username;
    setProfilePending(true);
    const result = await authClient.updateUser({ name: nextName });

    if (result.error) {
      setProfileError("Could not update your display name.");
      setProfilePending(false);
      return;
    }

    setProfileName(nextName);
    setProfilePending(false);
    setProfileSuccess(true);
    onDisplayNameChange(nextName);
  }

  function changeTheme(nextTheme: ThemePreference) {
    setThemePreference(nextTheme);
  }

  return (
    <div className="account-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <section
        aria-labelledby="account-title"
        aria-modal="true"
        className={sheet.dragging ? "account-dialog sheet-dragging" : "account-dialog"}
        role="dialog"
        style={sheet.style}
      >
        <div className="sheet-drag-region" {...sheet.dragProps}>
          <div className="panel-handle" aria-hidden="true" />
          <div className="account-dialog-header">
            <div>
              <p className="eyebrow">Account</p>
              <h2 id="account-title">{displayName}</h2>
              <p>@{username}</p>
            </div>
            <button className="panel-close" onClick={onClose} type="button"><X size={19} /><span className="sr-only">Close</span></button>
          </div>
        </div>

        <form className="profile-block" onSubmit={changeDisplayName}>
          <div className="account-section-heading">
            <UserRound aria-hidden="true" size={18} />
            <div><h3 id="display-name-heading">Display name <span className="label-optional">Optional</span></h3><p>Shown in your account menu.</p></div>
          </div>
          <div className="account-profile-row">
            <input
              aria-labelledby="display-name-heading"
              autoComplete="name"
              className="text-input"
              maxLength={50}
              onChange={(event) => {
                setProfileName(event.target.value);
                setProfileSuccess(false);
              }}
              placeholder="Leave blank to use your username"
              value={profileName}
            />
            <button className="secondary-button" disabled={profilePending} type="submit">
              {profilePending ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : null}
              Save
            </button>
          </div>
          {profileError ? <p className="form-error" role="alert">{profileError}</p> : null}
          {profileSuccess ? <p className="form-success" role="status"><Check size={15} /> Display name updated.</p> : null}
        </form>

        <div className="appearance-block">
          <div className="account-section-heading">
            <Palette aria-hidden="true" size={18} />
            <div><h3>Appearance</h3><p>Choose a theme for this browser.</p></div>
          </div>
          <div aria-label="Color theme" className="theme-control" role="group">
            {themes.map(({ icon: Icon, label, value }) => (
              <button aria-pressed={theme === value} className={theme === value ? "active" : undefined} key={value} onClick={() => changeTheme(value)} type="button">
                <Icon aria-hidden="true" size={15} /><span>{label}</span>
              </button>
            ))}
          </div>
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
