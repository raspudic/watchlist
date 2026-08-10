import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();

  return <AppShell username={session.user.username ?? session.user.name}>{children}</AppShell>;
}
