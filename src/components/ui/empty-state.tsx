import type { ReactNode } from "react";

export function EmptyState({
  actions,
  description,
  icon,
  title,
}: {
  actions?: ReactNode;
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="empty-state">
      <span aria-hidden="true" className="empty-state-icon">{icon}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {actions ? <div className="empty-state-actions">{actions}</div> : null}
    </div>
  );
}

export function EmptyInline({ children }: { children: ReactNode }) {
  return <div className="empty-inline">{children}</div>;
}
