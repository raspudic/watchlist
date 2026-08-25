import { describe, expect, it } from "vitest";

import { getPreviewShortcut, getSearchShortcut } from "@/lib/keyboard-shortcut";

describe("getSearchShortcut", () => {
  it.each([
    ["macOS", "Mozilla/5.0", "⌘ K", "Command K"],
    [null, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "⌘ K", "Command K"],
    [null, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Mobile/15E148 Safari/604.1", "⌘ K", "Command K"],
    [null, "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)", "⌘ K", "Command K"],
    ["iOS", "Mozilla/5.0 (iPhone)", "⌘ K", "Command K"],
    ["Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Ctrl K", "Control K"],
    ["Linux", "Mozilla/5.0 (X11; Linux x86_64)", "Ctrl K", "Control K"],
    ["Chrome OS", "Mozilla/5.0 (X11; CrOS x86_64 16093.68.0)", "Ctrl K", "Control K"],
    ["Android", "Mozilla/5.0 (Linux; Android 15)", "Ctrl K", "Control K"],
    [null, null, "Ctrl K", "Control K"],
  ])("maps %s / %s to the correct modifier", (platform, userAgent, display, ariaLabel) => {
    expect(getSearchShortcut(platform, userAgent)).toEqual({ ariaLabel, display });
  });
});

describe("getPreviewShortcut", () => {
  it.each([
    ["macOS", "Mozilla/5.0 (Macintosh; Intel Mac OS X)", 0, true, "⌘↵ Preview"],
    ["Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 10, true, "Ctrl↵ Preview"],
    ["Linux", "Mozilla/5.0 (X11; Linux x86_64)", 0, true, "Ctrl↵ Preview"],
    ["macOS", "Mozilla/5.0 (Macintosh) Mobile/15E148 Safari/604.1", 5, true, null],
    ["iPadOS", "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)", 5, true, null],
    ["iOS", "Mozilla/5.0 (iPhone)", 5, false, null],
    ["Android", "Mozilla/5.0 (Linux; Android 15)", 5, true, null],
    ["macOS", "Mozilla/5.0 (Macintosh; Intel Mac OS X)", 0, false, null],
  ])("maps device capabilities to a truthful preview hint", (platform, userAgent, touches, finePointer, display) => {
    expect(getPreviewShortcut(platform, userAgent, touches, finePointer)?.display ?? null).toBe(display);
  });
});
