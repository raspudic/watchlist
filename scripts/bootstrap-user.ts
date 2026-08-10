import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

import { createWatchlistAuth } from "../src/lib/auth";
import { db } from "../src/lib/db/client";
import { account, user } from "../src/lib/db/schema";

async function main() {
  const username = process.env.BOOTSTRAP_USERNAME?.trim().toLowerCase() || "mateo";
  const password = process.env.BOOTSTRAP_PASSWORD;

  if (!password) {
    throw new Error("BOOTSTRAP_PASSWORD is required. Run this command through `specific exec web`.");
  }

  const existing = await db.query.user.findFirst({
    where: eq(user.username, username),
  });

  if (existing) {
    const passwordHash = await hashPassword(password);
    const updatedAccounts = await db
      .update(account)
      .set({
        password: passwordHash,
        updatedAt: new Date(),
      })
      .where(
        and(eq(account.userId, existing.id), eq(account.providerId, "credential")),
      )
      .returning({ id: account.id });

    if (updatedAccounts.length !== 1) {
      throw new Error(`Expected one credential account for ${username}.`);
    }

    console.log(`Updated credentials for user ${username}.`);
    return;
  }

  const bootstrapAuth = createWatchlistAuth(false);

  await bootstrapAuth.api.signUpEmail({
    body: {
      email: `${username}@local.invalid`,
      name: username.charAt(0).toUpperCase() + username.slice(1),
      password,
      username,
    },
  });

  console.log(`Created user ${username}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
