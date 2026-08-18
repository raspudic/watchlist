import { eq } from "drizzle-orm";

import { createWatchlistAuth } from "../src/lib/auth";
import { db } from "../src/lib/db/client";
import { user } from "../src/lib/db/schema";

async function main() {
  const username = process.env.BOOTSTRAP_USERNAME?.trim().toLowerCase() || "watchlist";
  const existing = await db.query.user.findFirst({
    where: eq(user.username, username),
  });

  if (existing) {
    await db.update(user).set({ role: "admin", updatedAt: new Date() }).where(eq(user.id, existing.id));
    console.log(`User ${username} is configured as an administrator; their password is unchanged.`);
    return;
  }

  const password = process.env.BOOTSTRAP_PASSWORD;
  if (!password) {
    throw new Error("BOOTSTRAP_PASSWORD is required to create the administrator. Run this command through `specific exec web`.");
  }

  const bootstrapAuth = createWatchlistAuth({
    disableSignUp: false,
    checkCompromisedPasswords: false,
  });

  const result = await bootstrapAuth.api.signUpEmail({
    body: {
      email: `${username}@local.invalid`,
      name: username.charAt(0).toUpperCase() + username.slice(1),
      password,
      username,
    },
  });

  await db.update(user).set({ role: "admin", updatedAt: new Date() }).where(eq(user.id, result.user.id));

  console.log(`Created administrator ${username}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
