import { headers } from "next/headers";

import { AppShell } from "@/components/app-shell";
import { getSearchShortcut } from "@/lib/keyboard-shortcut";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: LayoutProps<"/">) {
  const [requestHeaders, session] = await Promise.all([headers(), requireSession()]);
  const searchShortcut = getSearchShortcut(
    requestHeaders.get("sec-ch-ua-platform"),
    requestHeaders.get("user-agent"),
  );

  return (
    <AppShell
      displayName={session.user.name}
      searchShortcut={searchShortcut}
      userId={session.user.id}
      username={session.user.username ?? session.user.name}
    >
      {children}
    </AppShell>
  );
}
