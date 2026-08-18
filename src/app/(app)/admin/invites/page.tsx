import { desc } from "drizzle-orm";

import { AdminInvitations, type InvitationSummary } from "@/components/admin-invitations";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db/client";
import { invitations } from "@/lib/db/schema";
import { invitationStatus } from "@/lib/invitations";

export const dynamic = "force-dynamic";

export default async function AdminInvitesPage() {
  await requireAdmin();
  const records = await db.select().from(invitations).orderBy(desc(invitations.createdAt)).limit(100);
  const initialInvitations: InvitationSummary[] = records.map((invitation) => ({
    id: invitation.id,
    email: invitation.email,
    createdAt: invitation.createdAt.toISOString(),
    expiresAt: invitation.expiresAt.toISOString(),
    acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
    revokedAt: invitation.revokedAt?.toISOString() ?? null,
    status: invitationStatus(invitation),
  }));

  return <AdminInvitations initialInvitations={initialInvitations} />;
}
