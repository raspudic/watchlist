import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getRequestAdmin } from "@/lib/admin";
import { db } from "@/lib/db/client";
import { invitations } from "@/lib/db/schema";

type InvitationRouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: InvitationRouteContext) {
  if (!await getRequestAdmin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const [invitation] = await db
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(invitations.id, id),
      isNull(invitations.acceptedAt),
      isNull(invitations.revokedAt),
    ))
    .returning({ id: invitations.id });

  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
  }

  return NextResponse.json({ status: true });
}
