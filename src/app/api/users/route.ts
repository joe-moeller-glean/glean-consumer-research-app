import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireRole, apiError } from "@/lib/auth";
import { userCreateSchema } from "@/lib/validation";

export async function GET() {
  try {
    await requireRole("ADMIN");
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        active: users.active,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));
    return Response.json({ users: rows });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole("ADMIN");
    const body = userCreateSchema.parse(await req.json());
    const hash = await bcrypt.hash(body.password, 10);
    const [created] = await db
      .insert(users)
      .values({
        email: body.email.toLowerCase().trim(),
        name: body.name,
        passwordHash: hash,
        role: body.role,
      })
      .returning({ id: users.id, email: users.email, name: users.name, role: users.role });
    return Response.json({ user: created }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
