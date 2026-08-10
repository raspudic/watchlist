"use client";

import { useEffect } from "react";

/** Registers an intentionally cache-free worker for the installable app shell. */
export function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // Installation remains available even when a browser declines worker registration.
      });
  }, []);

  return null;
}
