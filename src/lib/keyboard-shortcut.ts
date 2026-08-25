export type KeyboardShortcut = {
  ariaLabel: string;
  display: string;
};

export type PreviewShortcut = {
  display: "⌘↵ Preview" | "Ctrl↵ Preview";
};

const APPLE_PLATFORM = /\b(?:iOS|iPadOS|macOS)\b/i;
const APPLE_USER_AGENT = /(?:iPhone|iPad|iPod|Macintosh|Mac OS X)/i;
const MOBILE_USER_AGENT = /(?:Android|iPhone|iPad|iPod|Mobile)/i;

export function getSearchShortcut(platform: string | null, userAgent: string | null): KeyboardShortcut {
  const usesCommand = APPLE_PLATFORM.test(platform ?? "") || APPLE_USER_AGENT.test(userAgent ?? "");

  return usesCommand
    ? { ariaLabel: "Command K", display: "⌘ K" }
    : { ariaLabel: "Control K", display: "Ctrl K" };
}

/**
 * A shortcut label is useful only when the current device strongly implies a
 * physical keyboard. Browsers do not expose reliable iPad keyboard state, so
 * iPadOS is deliberately excluded even when a trackpad makes its pointer fine.
 */
export function getPreviewShortcut(
  platform: string | null,
  userAgent: string | null,
  maxTouchPoints: number,
  hasFinePointer: boolean,
): PreviewShortcut | null {
  const platformName = platform ?? "";
  const agent = userAgent ?? "";
  const isIpadDesktopMode = /(?:Mac|macOS)/i.test(platformName) && maxTouchPoints > 1;

  if (!hasFinePointer || MOBILE_USER_AGENT.test(agent) || isIpadDesktopMode) return null;

  const usesCommand = APPLE_PLATFORM.test(platformName) || APPLE_USER_AGENT.test(agent);
  return { display: usesCommand ? "⌘↵ Preview" : "Ctrl↵ Preview" };
}
