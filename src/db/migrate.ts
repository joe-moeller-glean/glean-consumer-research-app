import { migrate } from "drizzle-orm/node-postgres/migrator";
import bcrypt from "bcryptjs";
import path from "path";
import { db, pool } from "./index";
import { users } from "./schema";
import { env } from "@/lib/env";

async function main() {
  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  console.log("Migrations complete.");

  // Bootstrap admin on first run
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length === 0) {
    const hash = await bcrypt.hash(env.seedAdminPassword, 10);
    await db.insert(users).values({
      email: env.seedAdminEmail,
      name: "Admin",
      passwordHash: hash,
      role: "ADMIN",
    });
    console.log(`Bootstrapped admin user: ${env.seedAdminEmail}`);
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
