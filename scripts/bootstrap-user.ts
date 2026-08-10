import { eq } from "drizzle-orm";

import { createWatchlistAuth } from "../src/lib/auth";
import { db } from "../src/lib/db/client";
import { user } from "../src/lib/db/schema";

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
    console.log(`User ${username} already exists; leaving their password unchanged.`);
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
