import { and, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createWatchlistAuth } from "@/lib/auth";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/account-validation";
import { db } from "@/lib/db/client";
import { invitations } from "@/lib/db/schema";
import { hashInvitationToken } from "@/lib/invitations";

export const dynamic = "force-dynamic";

const invitedSignupAuth = createWatchlistAuth({ disableSignUp: false });
const redeemSchema = z.object({
  token: z.string().min(32).max(128),
  username: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9._]+$/),
  name: z.string().trim().max(50).optional(),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
});

async function releaseClaim(invitationId: string, claim: string) {
  await db
    .update(invitations)
    .set({ acceptedAt: null, acceptedBy: null })
    .where(and(eq(invitations.id, invitationId), eq(invitations.acceptedBy, claim)));
}

export async function POST(request: Request) {
  const parsed = redeemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Check your account details and try again." }, { status: 400 });
  }

  const now = new Date();
  const claim = `claim:${crypto.randomUUID()}`;
  const [invitation] = await db
    .update(invitations)
    .set({ acceptedAt: now, acceptedBy: claim })
    .where(and(
      eq(invitations.tokenHash, hashInvitationToken(parsed.data.token)),
      isNull(invitations.acceptedAt),
      isNull(invitations.revokedAt),
      gt(invitations.expiresAt, now),
    ))
    .returning();

  if (!invitation) {
    return NextResponse.json({ error: "This invitation is invalid or has expired." }, { status: 410 });
  }

  let authResponse: Response;
  try {
    authResponse = await invitedSignupAuth.api.signUpEmail({
      asResponse: true,
      headers: request.headers,
      body: {
        email: invitation.email,
        name: parsed.data.name || parsed.data.username,
        password: parsed.data.password,
        username: parsed.data.username,
      },
    });
  } catch {
    await releaseClaim(invitation.id, claim);
    return NextResponse.json({ error: "Could not create the account. Try again." }, { status: 500 });
  }

  if (!authResponse.ok) {
    const details = await authResponse.clone().json().catch(() => null) as { code?: string } | null;
    await releaseClaim(invitation.id, claim);
    const compromised = details?.code === "PASSWORD_COMPROMISED";
    return NextResponse.json(
      {
        code: details?.code,
        error: compromised
          ? "That password has appeared in a known data breach. Choose another one."
          : "Could not create that account. Try a different username.",
      },
      { status: authResponse.status === 429 ? 429 : 400 },
    );
  }

  const result = await authResponse.clone().json() as { user: { id: string } };
  await db
    .update(invitations)
    .set({ acceptedBy: result.user.id })
    .where(and(eq(invitations.id, invitation.id), eq(invitations.acceptedBy, claim)));

  return authResponse;
}
