"use client";

import { Bookmark, CheckCircle2, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";

import { AccountDialog } from "@/components/account-dialog";
import { GlobalSearch } from "@/components/global-search";
import { authClient } from "@/lib/auth-client";

const links = [
  { href: "/watchlist", label: "Watchlist", icon: Bookmark },
  { href: "/watched", label: "Watched", icon: CheckCircle2 },
];

export function AppShell({ children, displayName, username }: { children: ReactNode; displayName: string; username: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [accountOpen, setAccountOpen] = useState(false);

  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="brand" href="/watchlist" aria-label="Watchlist home">
          <span aria-hidden="true">/</span> watchlist
        </Link>
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
            <span className="avatar" aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</span>
            <span className="account-name">{displayName}</span>
            <Settings aria-hidden="true" size={15} />
          </button>
          <button className="icon-button" onClick={signOut} title="Sign out" type="button">
            <LogOut aria-hidden="true" size={17} />
            <span className="sr-only">Sign out</span>
          </button>
        </div>
      </aside>

      <GlobalSearch />

      <header className="mobile-header">
        <Link className="brand" href="/watchlist"><span aria-hidden="true">/</span> watchlist</Link>
        <button className="mobile-avatar" onClick={() => setAccountOpen(true)} title="Account" type="button">
          {displayName.slice(0, 1).toUpperCase()}
        </button>
      </header>

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
          displayName={displayName}
          onClose={() => setAccountOpen(false)}
          onSignOut={signOut}
          username={username}
        />
      ) : null}
    </div>
  );
}
