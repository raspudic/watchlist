"use client";

import { useEffect, useState } from "react";

import { getPreviewShortcut, type PreviewShortcut } from "@/lib/keyboard-shortcut";

const PHYSICAL_INPUT = "(hover: hover) and (pointer: fine)";

export function usePreviewShortcut() {
  const [shortcut, setShortcut] = useState<PreviewShortcut | null>(null);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const media = window.matchMedia(PHYSICAL_INPUT);
    const update = () => {
      setShortcut(getPreviewShortcut(
        navigator.platform,
        navigator.userAgent,
        navigator.maxTouchPoints,
        media.matches,
      ));
    };

    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return shortcut;
}
