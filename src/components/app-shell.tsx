"use client";

import { Bookmark, CheckCircle2, LogOut, Search, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";

import { AccountDialog } from "@/components/account-dialog";
import { GlobalSearch } from "@/components/global-search";
import { LibraryCacheProvider } from "@/components/library-cache-provider";
import { authClient } from "@/lib/auth-client";
import { clearLibraryCache } from "@/lib/library-cache";
import type { KeyboardShortcut } from "@/lib/keyboard-shortcut";

const links = [
  { href: "/watchlist", label: "Watchlist", icon: Bookmark },
  { href: "/watched", label: "Watched", icon: CheckCircle2 },
];

export function AppShell({
  children,
  displayName,
  searchShortcut,
  userId,
  username,
}: {
  children: ReactNode;
  displayName: string;
  searchShortcut: KeyboardShortcut;
  userId: string;
  username: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [accountOpen, setAccountOpen] = useState(false);
  const [currentDisplayName, setCurrentDisplayName] = useState(displayName);
  const [searchOpen, setSearchOpen] = useState(false);

  async function signOut() {
    await authClient.signOut();
    clearLibraryCache(userId);
    router.replace("/login");
    router.refresh();
  }

  return (
    <LibraryCacheProvider scope={userId}>
      <div className="app-frame">
        <aside className="sidebar">
          <Link className="brand" href="/watchlist" aria-label="Watchlist home">
            <span aria-hidden="true">/</span> watchlist
          </Link>
          <button className="nav-search-button" onClick={() => setSearchOpen(true)} type="button">
            <Search aria-hidden="true" size={18} strokeWidth={1.8} />
            <span>Search</span>
            <kbd aria-label={searchShortcut.ariaLabel}>{searchShortcut.display}</kbd>
          </button>
          <nav className="side-nav" aria-label="Library">
            {links.map(({ href, label, icon: Icon }) => (
              <Link className={pathname === href ? "nav-link active" : "nav-link"} href={href} key={href}>
                <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
          <p className="data-credit">Metadata by TMDB</p>
          <div className="sidebar-account">
            <button className="account-trigger" onClick={() => setAccountOpen(true)} type="button">
              <span className="avatar" aria-hidden="true">{currentDisplayName.slice(0, 1).toUpperCase()}</span>
              <span className="account-name">{currentDisplayName}</span>
              <Settings aria-hidden="true" size={15} />
            </button>
            <button className="icon-button" onClick={signOut} title="Sign out" type="button">
              <LogOut aria-hidden="true" size={17} />
              <span className="sr-only">Sign out</span>
            </button>
          </div>
        </aside>

        <header className="mobile-header">
          <Link className="brand" href="/watchlist"><span aria-hidden="true">/</span> watchlist</Link>
          <div className="mobile-header-actions">
            <button aria-label="Search library" className="mobile-search-button" onClick={() => setSearchOpen(true)} type="button">
              <Search aria-hidden="true" size={18} />
            </button>
            <button className="mobile-avatar" onClick={() => setAccountOpen(true)} title="Account" type="button">
              {currentDisplayName.slice(0, 1).toUpperCase()}
            </button>
          </div>
        </header>

        <GlobalSearch onOpenChange={setSearchOpen} open={searchOpen} />

        <main className="app-main">{children}</main>

        <nav className="bottom-nav" aria-label="Library">
          {links.map(({ href, label, icon: Icon }) => (
            <Link className={pathname === href ? "bottom-link active" : "bottom-link"} href={href} key={href}>
              <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        {accountOpen ? (
          <AccountDialog
            displayName={currentDisplayName}
            onClose={() => setAccountOpen(false)}
            onDisplayNameChange={(name) => {
              setCurrentDisplayName(name);
              router.refresh();
            }}
            onSignOut={signOut}
            username={username}
          />
        ) : null}
      </div>
    </LibraryCacheProvider>
  );
}
