import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { haveIBeenPwned, username } from "better-auth/plugins";
import { count, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { isRegionCode } from "@/lib/region";

const ONE_DAY = 60 * 60 * 24;
const THIRTY_DAYS = ONE_DAY * 30;
const ACCOUNT_DELETION_LOCK_ID = 2_026_08_19;

async function deleteAccountTransaction(userId: string) {
  await db.transaction(async (transaction) => {
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(${ACCOUNT_DELETION_LOCK_ID})`);

    const [account] = await transaction
      .select({ role: schema.user.role })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);

    if (!account) {
      throw new APIError("NOT_FOUND", { code: "USER_NOT_FOUND", message: "Account not found." });
    }

    if (account.role === "admin") {
      const [result] = await transaction
        .select({ total: count() })
        .from(schema.user)
        .where(eq(schema.user.role, "admin"));

      if (result.total <= 1) {
        throw new APIError("BAD_REQUEST", {
          code: "FINAL_ADMIN",
          message: "Create another administrator before deleting this account.",
        });
      }
    }

    // accepted_by is intentionally not a foreign key because invitation redemption
    // uses a short-lived claim value before the new user exists.
    await transaction.delete(schema.invitations).where(eq(schema.invitations.acceptedBy, userId));
    await transaction.delete(schema.user).where(eq(schema.user.id, userId));
  });
}

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
    appName: "watchlist",
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
    user: {
      additionalFields: {
        // The country used to look up streaming availability. Nullable because
        // "not chosen yet" is a state the UI prompts for rather than guesses.
        region: { type: "string", required: false, input: true },
      },
      deleteUser: {
        enabled: true,
        beforeDelete: async (account) => deleteAccountTransaction(account.id),
      },
    },
    hooks: {
      before: createAuthMiddleware(async (context) => {
        if (context.path === "/update-user") {
          // `region` is user input, so it is validated here rather than trusted
          // into a column that later becomes part of a TMDB request path.
          const region = (context.body as { region?: unknown } | undefined)?.region;
          if (region !== undefined && region !== null && !isRegionCode(region as string)) {
            throw new APIError("BAD_REQUEST", {
              code: "INVALID_REGION",
              message: "Choose a country from the list.",
            });
          }
          return;
        }

        if (context.path !== "/delete-user") return;
        const body = context.body as { password?: unknown } | undefined;
        if (typeof body?.password !== "string" || body.password.length === 0) {
          throw new APIError("BAD_REQUEST", {
            code: "PASSWORD_REQUIRED",
            message: "Your current password is required.",
          });
        }
      }),
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
        "/delete-user": {
          window: 60 * 10,
          max: 3,
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
