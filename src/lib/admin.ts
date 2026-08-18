import "server-only";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { getSession } from "@/lib/session";

export async function getRequestAdmin(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;

  const [account] = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);

  return account?.role === "admin" ? account : null;
}

export async function requireAdmin() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [account] = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);

  if (account?.role !== "admin") redirect("/watchlist");
  return session;
}

export async function isUserAdmin(userId: string) {
  const [account] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return account?.role === "admin";
}
