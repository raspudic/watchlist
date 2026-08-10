"use client";

import { Bookmark, CheckCircle2, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { authClient } from "@/lib/auth-client";

const links = [
  { href: "/watchlist", label: "Watchlist", icon: Bookmark },
  { href: "/watched", label: "Watched", icon: CheckCircle2 },
];

export function AppShell({ children, username }: { children: ReactNode; username: string }) {
  const pathname = usePathname();
  const router = useRouter();

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
        <div className="sidebar-account">
          <span className="avatar" aria-hidden="true">{username.slice(0, 1).toUpperCase()}</span>
          <span className="account-name">{username}</span>
          <button className="icon-button" onClick={signOut} title="Sign out" type="button">
            <LogOut aria-hidden="true" size={17} />
            <span className="sr-only">Sign out</span>
          </button>
        </div>
      </aside>

      <header className="mobile-header">
        <Link className="brand" href="/watchlist"><span aria-hidden="true">/</span> watchlist</Link>
        <button className="mobile-avatar" onClick={signOut} title="Sign out" type="button">
          {username.slice(0, 1).toUpperCase()}
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
    </div>
  );
}
