import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getRequestAdmin } from "@/lib/admin";
import { db } from "@/lib/db/client";
import { invitations } from "@/lib/db/schema";
import {
  createInvitationToken,
  hashInvitationToken,
  invitationExpiresAt,
  invitationStatus,
  normalizeInvitationEmail,
} from "@/lib/invitations";

export const dynamic = "force-dynamic";

const createInvitationSchema = z.object({
  email: z.email().max(320),
});

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function serializeInvitation(invitation: typeof invitations.$inferSelect) {
  return {
    id: invitation.id,
    email: invitation.email,
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt,
    revokedAt: invitation.revokedAt,
    status: invitationStatus(invitation),
  };
}

export async function GET(request: Request) {
  if (!await getRequestAdmin(request)) return forbidden();

  const records = await db
    .select()
    .from(invitations)
    .orderBy(desc(invitations.createdAt))
    .limit(100);

  return NextResponse.json(
    { invitations: records.map(serializeInvitation) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const admin = await getRequestAdmin(request);
  if (!admin) return forbidden();

  const parsed = createInvitationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const now = new Date();
  const email = normalizeInvitationEmail(parsed.data.email);
  const token = createInvitationToken();
  const expiresAt = invitationExpiresAt(now);

  await db
    .update(invitations)
    .set({ revokedAt: now })
    .where(and(
      eq(invitations.email, email),
      isNull(invitations.acceptedAt),
      isNull(invitations.revokedAt),
      gt(invitations.expiresAt, now),
    ));

  const [invitation] = await db
    .insert(invitations)
    .values({
      id: crypto.randomUUID(),
      email,
      tokenHash: hashInvitationToken(token),
      createdBy: admin.id,
      createdAt: now,
      expiresAt,
    })
    .returning();

  const invitationUrl = new URL(`/invite/${token}`, request.url).toString();
  return NextResponse.json(
    { invitation: serializeInvitation(invitation), invitationUrl },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}
