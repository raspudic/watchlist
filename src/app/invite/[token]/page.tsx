import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";

import { SignupForm } from "@/components/signup-form";
import { db } from "@/lib/db/client";
import { invitations } from "@/lib/db/schema";
import { hashInvitationToken } from "@/lib/invitations";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  if (await getSession()) redirect("/watchlist");

  const { token } = await params;
  const [invitation] = await db
    .select({ email: invitations.email, expiresAt: invitations.expiresAt })
    .from(invitations)
    .where(and(
      eq(invitations.tokenHash, hashInvitationToken(token)),
      isNull(invitations.acceptedAt),
      isNull(invitations.revokedAt),
      gt(invitations.expiresAt, new Date()),
    ))
    .limit(1);

  return (
    <main className="login-page signup-page">
      <section className="login-panel signup-panel">
        <div className="login-brand"><span>/</span> watchlist</div>
        <div className="login-copy">
          <h1>{invitation ? "Accept your invitation" : "Invitation unavailable"}</h1>
          <p>
            {invitation
              ? `Create the private account invited for ${invitation.email}.`
              : "This invitation is invalid, expired, revoked, or has already been used."}
          </p>
        </div>
        {invitation ? <SignupForm email={invitation.email} invitationToken={token} /> : (
          <p className="auth-switch"><a href="/login">Return to sign in</a></p>
        )}
      </section>
    </main>
  );
}
