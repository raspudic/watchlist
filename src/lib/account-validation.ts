export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const ACCOUNT_DELETION_CONFIRMATION = "DELETE";

export function validateNewPassword(password: string, confirmation: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Use no more than ${MAX_PASSWORD_LENGTH} characters.`;
  }

  if (password !== confirmation) {
    return "The passwords do not match.";
  }

  return null;
}

export function validateAccountDeletion(password: string, confirmation: string) {
  if (!password) return "Enter your current password.";
  if (confirmation !== ACCOUNT_DELETION_CONFIRMATION) {
    return `Type ${ACCOUNT_DELETION_CONFIRMATION} to confirm.`;
  }
  return null;
}
