"use client";

import { Menu } from "@base-ui/react/menu";
import { Info, LogOut, Monitor, Moon, Settings, Sun } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useSyncExternalStore } from "react";

import { authClient } from "@/lib/auth-client";
import { clearLibraryCache } from "@/lib/library-cache";
import {
  type ThemePreference,
  readThemePreference,
  subscribeToThemePreference,
  writeThemePreference,
} from "@/lib/theme";

const themes: Array<{ icon: typeof Sun; label: string; value: ThemePreference }> = [
  { icon: Sun, label: "Light", value: "light" },
  { icon: Monitor, label: "System", value: "system" },
  { icon: Moon, label: "Dark", value: "dark" },
];

function serverThemePreference(): ThemePreference {
  return "system";
}

export function useSignOut(userId: string) {
  const router = useRouter();

  return useCallback(async () => {
    await authClient.signOut();
    clearLibraryCache(userId);
    router.replace("/login");
    router.refresh();
  }, [router, userId]);
}

export function AccountMenu({
  align = "start",
  children,
  className,
  displayName,
  label,
  onSignOut,
  side = "top",
  username,
}: {
  align?: "start" | "center" | "end";
  children: ReactNode;
  className: string;
  displayName: string;
  label?: string;
  onSignOut: () => void;
  side?: "top" | "bottom";
  username: string;
}) {
  const theme = useSyncExternalStore(subscribeToThemePreference, readThemePreference, serverThemePreference);

  return (
    <Menu.Root>
      <Menu.Trigger aria-label={label} className={className}>
        {children}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align={align} className="menu-positioner" side={side} sideOffset={8}>
          <Menu.Popup className="menu-popup">
            <div className="menu-identity">
              <strong>{displayName}</strong>
              <span>@{username}</span>
            </div>

            <div className="menu-row">
              <span className="menu-row-label">Theme</span>
              {/* A radio group rather than a toggle group: arrow keys stay with the
                  menu's own roving focus instead of being captured by the control. */}
              <Menu.RadioGroup
                className="menu-theme"
                onValueChange={(value) => writeThemePreference(value as ThemePreference)}
                value={theme}
              >
                {themes.map(({ icon: Icon, label: themeLabel, value }) => (
                  <Menu.RadioItem aria-label={themeLabel} className="menu-item" key={value} value={value}>
                    <Icon aria-hidden="true" size={14} />
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </div>

            <Menu.Separator className="menu-separator" />

            <Menu.LinkItem className="menu-item" closeOnClick render={<Link href="/settings" />}>
              <Settings aria-hidden="true" size={15} />
              Settings
            </Menu.LinkItem>
            <Menu.LinkItem className="menu-item" closeOnClick render={<Link href="/about" />}>
              <Info aria-hidden="true" size={15} />
              About &amp; privacy
            </Menu.LinkItem>

            <Menu.Separator className="menu-separator" />

            <Menu.Item className="menu-item" onClick={onSignOut}>
              <LogOut aria-hidden="true" size={15} />
              Sign out
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
