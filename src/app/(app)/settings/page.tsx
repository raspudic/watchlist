import type { Metadata } from "next";

import { SessionManager } from "@/components/session-manager";
import { DeleteAccountCard } from "@/components/settings/delete-account-card";
import { PasswordCard } from "@/components/settings/password-card";
import { ProfileCard } from "@/components/settings/profile-card";
import { RegionCard } from "@/components/settings/region-card";
import { SettingsFooter } from "@/components/settings/settings-footer";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await requireSession();
  const username = session.user.username ?? session.user.name;

  return (
    <div className="settings-page">
      <header className="settings-heading">
        <h1>Settings</h1>
        <p>Signed in as @{username}</p>
      </header>

      <ProfileCard displayName={session.user.name} username={username} />
      <RegionCard />
      <PasswordCard />

      <section className="settings-card">
        <h2>Devices</h2>
        <p>Everywhere your account is signed in. Revoke anything you don’t recognise.</p>
        <SessionManager currentSessionId={session.session.id} />
      </section>

      <DeleteAccountCard />
      <SettingsFooter userId={session.user.id} />
    </div>
  );
}
