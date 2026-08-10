import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString && process.env.NEXT_PHASE !== "phase-production-build") {
  throw new Error("DATABASE_URL is required at runtime. Start the app with `specific dev`.");
}

const client = postgres(
  connectionString ?? "postgres://build:build@127.0.0.1:5432/build",
  { prepare: false },
);

export const db = drizzle(client, { schema });
