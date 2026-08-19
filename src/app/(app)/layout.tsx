import { headers } from "next/headers";

import { AppShell } from "@/components/app-shell";
import { RegionProvider } from "@/components/region-provider";
import { isUserAdmin } from "@/lib/admin";
import { getSearchShortcut } from "@/lib/keyboard-shortcut";
import { isRegionCode, parseRegionFromAcceptLanguage } from "@/lib/region";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();
  const [requestHeaders, isAdmin] = await Promise.all([headers(), isUserAdmin(session.user.id)]);
  const searchShortcut = getSearchShortcut(
    requestHeaders.get("sec-ch-ua-platform"),
    requestHeaders.get("user-agent"),
  );
  const region = session.user.region;

  return (
    <RegionProvider
      region={isRegionCode(region) ? region : null}
      suggestedRegion={parseRegionFromAcceptLanguage(requestHeaders.get("accept-language"))}
    >
      <AppShell
        displayName={session.user.name}
        isAdmin={isAdmin}
        searchShortcut={searchShortcut}
        userId={session.user.id}
        username={session.user.username ?? session.user.name}
      >
        {children}
      </AppShell>
    </RegionProvider>
  );
}
