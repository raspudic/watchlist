"use client";

import { Toast } from "@base-ui/react/toast";
import { X } from "lucide-react";
import type { ReactNode } from "react";

export const useToast = Toast.useToastManager;

function ToastList() {
  const { toasts } = Toast.useToastManager();

  return toasts.map((toast) => (
    <Toast.Root className="toast-root" key={toast.id} toast={toast}>
      <Toast.Title className="toast-title" />
      {toast.actionProps ? <Toast.Action className="toast-action" /> : null}
      <Toast.Close aria-label="Dismiss" className="toast-close">
        <X aria-hidden="true" size={14} />
      </Toast.Close>
    </Toast.Root>
  ));
}

/* One provider at the application shell. Transient messages only — inline
   validation and persistent errors stay on the page. */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="toast-viewport">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}
