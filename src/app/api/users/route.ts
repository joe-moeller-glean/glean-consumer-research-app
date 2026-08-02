import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireRole, apiError, ApiError, readJson } from "@/lib/auth";
import { userCreateSchema } from "@/lib/validation";

// Never selects password_hash.
const publicColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  active: users.active,
  createdAt: users.createdAt,
};

export async function GET() {
  try {
    await requireRole("ADMIN");
    const rows = await db.select(publicColumns).from(users).orderBy(desc(users.createdAt));
    return Response.json({ users: rows });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole("ADMIN");
    const body = userCreateSchema.parse(await readJson(req));
    const email = body.email.toLowerCase().trim();

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing[0]) throw new ApiError(409, "A user with that email already exists");

    const [created] = await db
      .insert(users)
      .values({
        email,
        name: body.name,
        passwordHash: await bcrypt.hash(body.password, 12),
        role: body.role,
      })
      .returning(publicColumns);
    return Response.json({ user: created }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
