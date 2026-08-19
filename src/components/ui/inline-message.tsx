"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

import { IconButton } from "@/components/ui/button";

export function InlineMessage({
  children,
  onDismiss,
  tone = "error",
}: {
  children: ReactNode;
  onDismiss?: () => void;
  tone?: "error" | "success" | "neutral";
}) {
  return (
    <div className={`inline-message inline-message-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span>{children}</span>
      {onDismiss ? (
        <IconButton label="Dismiss" onClick={onDismiss}>
          <X aria-hidden="true" size={16} />
        </IconButton>
      ) : null}
    </div>
  );
}
