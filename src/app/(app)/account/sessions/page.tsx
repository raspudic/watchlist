import { SessionManager } from "@/components/session-manager";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AccountSessionsPage() {
  const session = await requireSession();

  return (
    <section className="sessions-page">
      <header className="sessions-heading">
        <p className="eyebrow">Account security</p>
        <h1>Active sessions</h1>
        <p>Review the devices signed in to your account and revoke any you don’t recognize.</p>
      </header>
      <div className="sessions-card">
        <SessionManager currentSessionId={session.session.id} />
      </div>
    </section>
  );
}
