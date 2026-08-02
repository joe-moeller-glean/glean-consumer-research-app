import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireRole, apiError, ApiError } from "@/lib/auth";
import { userUpdateSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireRole("ADMIN");
    const { id } = await ctx.params;
    const rows = await db
      .select({ id: users.id, email: users.email, name: users.name, role: users.role, active: users.active, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!rows[0]) throw new ApiError(404, "User not found");
    return Response.json({ user: rows[0] });
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    await requireRole("ADMIN");
    const { id } = await ctx.params;
    const body = userUpdateSchema.parse(await req.json());
    const values: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
    if (body.email) values.email = body.email.toLowerCase().trim();
    if (body.name) values.name = body.name;
    if (body.role) values.role = body.role;
    if (body.active !== undefined) values.active = body.active;
    if (body.password) values.passwordHash = await bcrypt.hash(body.password, 10);
    const [updated] = await db
      .update(users)
      .set(values)
      .where(eq(users.id, id))
      .returning({ id: users.id, email: users.email, name: users.name, role: users.role, active: users.active });
    if (!updated) throw new ApiError(404, "User not found");
    return Response.json({ user: updated });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const me = await requireRole("ADMIN");
    const { id } = await ctx.params;
    if (id === me.id) throw new ApiError(400, "Cannot delete your own account");
    const [deleted] = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
    if (!deleted) throw new ApiError(404, "User not found");
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
