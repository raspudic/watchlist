"use client";

import { Bookmark, ChartColumn, CheckCircle2, ChevronsUpDown, Search, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";

import { AccountMenu, useSignOut } from "@/components/account-menu";
import { GlobalSearch } from "@/components/global-search";
import { LibraryCacheProvider } from "@/components/library-cache-provider";
import { ToastProvider } from "@/components/ui/toast";
import type { KeyboardShortcut } from "@/lib/keyboard-shortcut";

/*
 * These routes are dynamic and have no loading boundary, so the default `auto`
 * prefetch stores nothing and each tab switch waits on a server round trip.
 * Their payload carries no server data — the lists come from the client caches
 * — so the links below opt into a full `prefetch`.
 */
const links = [
  { href: "/watchlist", label: "Watchlist", icon: Bookmark },
  { href: "/watched", label: "Watched", icon: CheckCircle2 },
  { href: "/insights", label: "Insights", icon: ChartColumn },
];

export function AppShell({
  children,
  displayName,
  isAdmin,
  searchShortcut,
  userId,
  username,
}: {
  children: ReactNode;
  displayName: string;
  isAdmin: boolean;
  searchShortcut: KeyboardShortcut;
  userId: string;
  username: string;
}) {
  const pathname = usePathname();
  const signOut = useSignOut(userId);
  const [searchOpen, setSearchOpen] = useState(false);
  const initial = displayName.slice(0, 1).toUpperCase();

  return (
    <LibraryCacheProvider scope={userId}>
      <ToastProvider>
        <div className="app-frame">
          <aside className="sidebar">
            <Link className="brand" href="/watchlist" aria-label="watchlist home">
              <span aria-hidden="true">/</span> watchlist
            </Link>
            <button className="nav-search-button" onClick={() => setSearchOpen(true)} type="button">
              <Search aria-hidden="true" size={18} strokeWidth={1.8} />
              <span>Search</span>
              <kbd aria-label={searchShortcut.ariaLabel}>{searchShortcut.display}</kbd>
            </button>
            <nav className="side-nav" aria-label="Library">
              {links.map(({ href, label, icon: Icon }) => (
                <Link className={pathname === href ? "nav-link active" : "nav-link"} href={href} key={href} prefetch>
                  <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                  <span>{label}</span>
                </Link>
              ))}
              {isAdmin ? (
                <>
                  <div className="nav-sep" />
                  <Link className={pathname === "/people" ? "nav-link active" : "nav-link"} href="/people">
                    <Users aria-hidden="true" size={18} strokeWidth={1.8} />
                    <span>People</span>
                  </Link>
                </>
              ) : null}
            </nav>
            <div className="sidebar-account">
              <AccountMenu
                className="account-trigger"
                displayName={displayName}
                onSignOut={signOut}
                username={username}
              >
                <span className="avatar" aria-hidden="true">{initial}</span>
                <span className="account-name">{displayName}</span>
                <ChevronsUpDown aria-hidden="true" size={15} />
              </AccountMenu>
            </div>
          </aside>

          <header className="mobile-header">
            <Link className="brand" href="/watchlist"><span aria-hidden="true">/</span> watchlist</Link>
            <div className="mobile-header-actions">
              <button aria-label="Search library" className="mobile-search-button" onClick={() => setSearchOpen(true)} type="button">
                <Search aria-hidden="true" size={18} />
              </button>
              <AccountMenu
                align="end"
                className="mobile-avatar"
                displayName={displayName}
                label="Account"
                onSignOut={signOut}
                side="bottom"
                username={username}
              >
                {initial}
              </AccountMenu>
            </div>
          </header>

          <GlobalSearch onOpenChange={setSearchOpen} open={searchOpen} />

          <main className="app-main">{children}</main>

          <nav className="bottom-nav" aria-label="Library">
            {links.map(({ href, label, icon: Icon }) => (
              <Link className={pathname === href ? "bottom-link active" : "bottom-link"} href={href} key={href} prefetch>
                <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </ToastProvider>
    </LibraryCacheProvider>
  );
}
