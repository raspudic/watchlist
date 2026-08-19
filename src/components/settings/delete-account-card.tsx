"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { PasswordField, TextField } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
import { ACCOUNT_DELETION_CONFIRMATION, validateAccountDeletion } from "@/lib/account-validation";
import { authClient } from "@/lib/auth-client";

export function DeleteAccountCard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) return;
    setPassword("");
    setConfirmation("");
    setError("");
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const validationError = validateAccountDeletion(password, confirmation);
    if (validationError) {
      setError(validationError);
      return;
    }

    setPending(true);
    const result = await authClient.deleteUser({ password });

    if (result.error) {
      setError(
        result.error.status === 429
          ? "Too many attempts. Please try again later."
          : result.error.code === "FINAL_ADMIN"
            ? "Create another administrator before deleting this account."
            : "Your current password was not accepted.",
      );
      setPending(false);
      return;
    }

    router.replace("/login?deleted=1");
    router.refresh();
  }

  return (
    <section className="settings-card settings-card-danger">
      <h2>Delete account</h2>
      <p>Permanently removes your profile, sessions, and complete library. This cannot be undone.</p>
      <div className="settings-actions">
        <Button onClick={() => changeOpen(true)} variant="danger">Delete account…</Button>
      </div>

      <AlertDialog.Root onOpenChange={changeOpen} open={open}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="backdrop" />
          <AlertDialog.Viewport className="overlay-viewport overlay-viewport-center">
            <AlertDialog.Popup className="dialog-popup delete-dialog">
              <form className="delete-dialog-body" onSubmit={deleteAccount}>
                <AlertDialog.Title className="dialog-title">Delete your account?</AlertDialog.Title>
                <AlertDialog.Description render={<p />}>
                  Everything you have saved goes with it. This cannot be undone.
                </AlertDialog.Description>
                <PasswordField
                  label="Current password"
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  value={password}
                />
                <TextField
                  autoComplete="off"
                  label={`Type ${ACCOUNT_DELETION_CONFIRMATION} to confirm`}
                  onChange={(event) => setConfirmation(event.target.value)}
                  pattern={ACCOUNT_DELETION_CONFIRMATION}
                  required
                  spellCheck={false}
                  value={confirmation}
                />
                {error ? <InlineMessage>{error}</InlineMessage> : null}
                <div className="delete-dialog-actions">
                  <Button onClick={() => changeOpen(false)} type="button" variant="secondary">Cancel</Button>
                  <Button
                    disabled={confirmation !== ACCOUNT_DELETION_CONFIRMATION}
                    loading={pending}
                    loadingLabel="Deleting…"
                    type="submit"
                    variant="danger"
                  >
                    Delete account
                  </Button>
                </div>
              </form>
            </AlertDialog.Popup>
          </AlertDialog.Viewport>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </section>
  );
}
