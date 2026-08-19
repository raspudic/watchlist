"use client";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import type { ReactNode } from "react";

export type SegmentedItem<T extends string> = {
  icon?: ReactNode;
  label: string;
  showLabel?: boolean;
  value: T;
};

export function SegmentedControl<T extends string>({
  allowEmpty = false,
  className,
  fill = false,
  iconsOnly = false,
  items,
  label,
  onValueChange,
  value,
}: {
  /* Rating is the only control that may be cleared by pressing the active item. */
  allowEmpty?: boolean;
  className?: string;
  fill?: boolean;
  iconsOnly?: boolean;
  items: Array<SegmentedItem<T>>;
  label: string;
  onValueChange: (value: T | null) => void;
  value: T | null;
}) {
  const classes = ["segmented"];
  if (iconsOnly) classes.push("segmented-icons");
  if (fill) classes.push("segmented-fill");
  if (className) classes.push(className);

  return (
    <ToggleGroup
      aria-label={label}
      className={classes.join(" ")}
      onValueChange={(next) => {
        const selected = next[0] as T | undefined;
        if (selected) {
          onValueChange(selected);
          return;
        }
        if (allowEmpty) onValueChange(null);
      }}
      value={value === null ? [] : [value]}
    >
      {items.map((item) => (
        <Toggle
          aria-label={item.showLabel === false || iconsOnly ? item.label : undefined}
          key={item.value}
          value={item.value}
        >
          {item.icon}
          {iconsOnly || item.showLabel === false ? null : <span>{item.label}</span>}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
