"use client";

import { Tabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";

export type FilterTab<T extends string> = { count: number; label: string; value: T };

/* Counted tabs. They carry the filter and the totals, so a library page needs
   no separate filter control and no repeated count band above the list. */
export function FilterTabs<T extends string>({
  children,
  items,
  label,
  onValueChange,
  trailing,
  value,
}: {
  children: ReactNode;
  items: Array<FilterTab<T>>;
  label: string;
  onValueChange: (value: T) => void;
  trailing?: ReactNode;
  value: T;
}) {
  return (
    <Tabs.Root onValueChange={(next) => onValueChange(next as T)} value={value}>
      <div className="tabs">
        <Tabs.List aria-label={label} className="tabs-list">
          {items.map((item) => (
            <Tabs.Tab className="tab" key={item.value} value={item.value}>
              {item.label}
              <span className="tab-count">{item.count}</span>
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {trailing}
      </div>
      <Tabs.Panel value={value}>{children}</Tabs.Panel>
    </Tabs.Root>
  );
}
