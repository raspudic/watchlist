"use client";

import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { Spinner } from "@/components/ui/spinner";

type Variant = "primary" | "secondary" | "quiet" | "ghost" | "danger";

type BaseProps = Omit<ComponentPropsWithoutRef<typeof BaseButton>, "children" | "className"> & {
  className?: string;
};

export function Button({
  children,
  className,
  fullWidth = false,
  loading = false,
  loadingLabel,
  size = "md",
  variant = "primary",
  ...props
}: BaseProps & {
  children: ReactNode;
  fullWidth?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  size?: "md" | "sm";
  variant?: Variant;
}) {
  const classes = ["btn", `btn-${variant}`];
  if (size === "sm") classes.push("btn-sm");
  if (fullWidth) classes.push("btn-block");
  if (className) classes.push(className);

  return (
    <BaseButton
      className={classes.join(" ")}
      data-loading={loading ? "" : undefined}
      disabled={loading || props.disabled}
      focusableWhenDisabled={loading}
      {...props}
    >
      {loading ? <Spinner size={size === "sm" ? 15 : 17} /> : null}
      {loading && loadingLabel ? loadingLabel : children}
    </BaseButton>
  );
}

export function IconButton({
  children,
  className,
  label,
  loading = false,
  size = "sm",
  tone,
  ...props
}: BaseProps & {
  children: ReactNode;
  /* Required: an icon-only control carries no accessible name of its own. */
  label: string;
  loading?: boolean;
  size?: "sm" | "lg";
  tone?: "danger";
}) {
  const classes = ["icon-btn"];
  if (size === "lg") classes.push("icon-btn-lg");
  if (tone === "danger") classes.push("icon-btn-danger");
  if (className) classes.push(className);

  return (
    <BaseButton
      className={classes.join(" ")}
      disabled={loading || props.disabled}
      focusableWhenDisabled={loading}
      {...props}
    >
      {loading ? <Spinner size={size === "lg" ? 18 : 16} /> : children}
      <span className="sr-only">{label}</span>
    </BaseButton>
  );
}
