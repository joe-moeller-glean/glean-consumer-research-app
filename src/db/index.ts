import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __pgPool?: pg.Pool };

export const pool =
  globalForDb.__pgPool ??
  new pg.Pool({
    connectionString: env.databaseUrl,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__pgPool = pool;

export const db = drizzle(pool, { schema });
