export type KeyboardShortcut = {
  ariaLabel: string;
  display: string;
};

const APPLE_PLATFORM = /\b(?:iOS|iPadOS|macOS)\b/i;
const APPLE_USER_AGENT = /(?:iPhone|iPad|iPod|Macintosh|Mac OS X)/i;

export function getSearchShortcut(platform: string | null, userAgent: string | null): KeyboardShortcut {
  const usesCommand = APPLE_PLATFORM.test(platform ?? "") || APPLE_USER_AGENT.test(userAgent ?? "");

  return usesCommand
    ? { ariaLabel: "Command K", display: "⌘ K" }
    : { ariaLabel: "Control K", display: "Ctrl K" };
}
