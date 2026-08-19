"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Drawer } from "@base-ui/react/drawer";
import { useMediaQuery } from "@base-ui/react/unstable-use-media-query";
import type { ReactNode } from "react";

export const SheetTitle = BaseDialog.Title;
export const SheetDescription = BaseDialog.Description;

const MOBILE = "(max-width: 760px)";

/* Responsive modal panel: a centred dialog on desktop, a swipe-dismissable
   bottom sheet on touch widths. Pass `dismissible={false}` to hold it open
   while a mutation is in flight. */
export function Sheet({
  children,
  className,
  dismissible = true,
  onOpenChange,
  open,
}: {
  children: ReactNode;
  className?: string;
  dismissible?: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const isMobile = useMediaQuery(MOBILE, { defaultMatches: false });
  const popupClass = ["sheet-popup", className].filter(Boolean).join(" ");

  if (isMobile) {
    return (
      <Drawer.Root
        disablePointerDismissal={!dismissible}
        onOpenChange={(next, details) => {
          if (!next && !dismissible) {
            details.cancel();
            return;
          }
          onOpenChange(next);
        }}
        open={open}
        swipeDirection="down"
      >
        <Drawer.Portal>
          <Drawer.Backdrop className="backdrop" />
          <Drawer.Viewport className="overlay-viewport">
            <Drawer.Popup className={popupClass}>
              <Drawer.Content className="sheet-content">
                <div aria-hidden="true" className="sheet-handle" />
                {children}
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <BaseDialog.Root
      onOpenChange={(next, details) => {
        if (!next && !dismissible) {
          details.cancel();
          return;
        }
        onOpenChange(next);
      }}
      open={open}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="backdrop" />
        <BaseDialog.Viewport className="overlay-viewport overlay-viewport-center">
          <BaseDialog.Popup className={popupClass}>{children}</BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
