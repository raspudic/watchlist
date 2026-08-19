import type { ReactNode } from "react";

type Tone = "neutral" | "accent";

export function Badge({
  children,
  tone = "neutral",
  uppercase = false,
}: {
  children: ReactNode;
  tone?: Tone;
  uppercase?: boolean;
}) {
  const classes = ["badge"];
  if (tone === "accent") classes.push("badge-accent");
  if (uppercase) classes.push("badge-uppercase");
  return <span className={classes.join(" ")}>{children}</span>;
}

export function CountBadge({ children }: { children: ReactNode }) {
  return <span className="badge badge-count">{children}</span>;
}

export function TypeBadge({ children }: { children: ReactNode }) {
  return <span className="badge-type">{children}</span>;
}
