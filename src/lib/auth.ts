import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";

import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

const SIX_MONTHS = 60 * 60 * 24 * 180;
const ONE_DAY = 60 * 60 * 24;

function getSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;

  if (!secret && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error("BETTER_AUTH_SECRET is required at runtime. Start the app with `specific dev`.");
  }

  return secret ?? "build-time-placeholder-not-used-at-runtime";
}

export function createWatchlistAuth(disableSignUp = true) {
  const baseURL = process.env.BETTER_AUTH_URL;

  return betterAuth({
    appName: "Watchlist",
    baseURL,
    secret: getSecret(),
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    trustedOrigins: baseURL ? [baseURL] : [],
    emailAndPassword: {
      enabled: true,
      disableSignUp,
      minPasswordLength: 8,
    },
    session: {
      expiresIn: SIX_MONTHS,
      updateAge: ONE_DAY,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "rateLimit",
      window: 60,
      max: 20,
      customRules: {
        "/sign-in/username": {
          window: 60,
          max: 5,
        },
      },
    },
    disabledPaths: ["/is-username-available"],
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 30,
      }),
    ],
  });
}

export const auth = createWatchlistAuth(true);
