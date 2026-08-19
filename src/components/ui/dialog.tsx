"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";

export const DialogTitle = BaseDialog.Title;
export const DialogDescription = BaseDialog.Description;
export const DialogClose = BaseDialog.Close;

/* Centred, non-gesture overlay. Base UI owns the portal, backdrop, focus trap,
   Escape, outside press, background inertness and scroll locking. */
export function Dialog({
  align = "top",
  children,
  className,
  onOpenChange,
  open,
}: {
  align?: "top" | "center";
  children: ReactNode;
  className?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <BaseDialog.Root onOpenChange={onOpenChange} open={open}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="backdrop" />
        <BaseDialog.Viewport className={`overlay-viewport overlay-viewport-${align}`}>
          <BaseDialog.Popup className={["dialog-popup", className].filter(Boolean).join(" ")}>
            {children}
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
