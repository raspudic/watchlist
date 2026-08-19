"use client";

import { Info, LogOut } from "lucide-react";
import Link from "next/link";

import { useSignOut } from "@/components/account-menu";
import { Button } from "@/components/ui/button";

export function SettingsFooter({ userId }: { userId: string }) {
  const signOut = useSignOut(userId);

  return (
    <div className="settings-footer">
      <Button onClick={signOut} variant="ghost">
        <LogOut aria-hidden="true" size={16} />
        Sign out
      </Button>
      <Link href="/about">
        <Info aria-hidden="true" size={16} />
        About &amp; privacy
      </Link>
    </div>
  );
}
