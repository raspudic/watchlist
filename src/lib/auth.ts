import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { haveIBeenPwned, username } from "better-auth/plugins";

import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

const ONE_DAY = 60 * 60 * 24;
const THIRTY_DAYS = ONE_DAY * 30;

interface WatchlistAuthOptions {
  disableSignUp?: boolean;
  checkCompromisedPasswords?: boolean;
}

function getSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;

  if (!secret && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error("BETTER_AUTH_SECRET is required at runtime. Start the app with `specific dev`.");
  }

  return secret ?? "build-time-placeholder-not-used-at-runtime";
}

export function createWatchlistAuth({
  disableSignUp = true,
  checkCompromisedPasswords = true,
}: WatchlistAuthOptions = {}) {
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
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: THIRTY_DAYS,
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
        "/sign-up/email": {
          window: 60 * 60,
          max: 5,
        },
        "/change-password": {
          window: 60 * 10,
          max: 5,
        },
      },
    },
    disabledPaths: ["/is-username-available"],
    plugins: [
      haveIBeenPwned({
        enabled: checkCompromisedPasswords,
        customPasswordCompromisedMessage: "Choose a password that has not appeared in a known data breach.",
      }),
      username({
        minUsernameLength: 3,
        maxUsernameLength: 30,
        displayUsernameValidator: (displayUsername) => {
          const length = displayUsername.trim().length;
          return length >= 1 && length <= 50;
        },
      }),
    ],
  });
}

export const auth = createWatchlistAuth({ disableSignUp: true });
