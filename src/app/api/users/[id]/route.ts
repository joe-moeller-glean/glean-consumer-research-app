import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { eq, and, ne, count } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireRole, apiError, ApiError, requireUuid, readJson } from "@/lib/auth";
import { userUpdateSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

const publicColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  active: users.active,
  createdAt: users.createdAt,
};

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireRole("ADMIN");
    const id = requireUuid((await ctx.params).id, "user id");
    const [user] = await db.select(publicColumns).from(users).where(eq(users.id, id)).limit(1);
    if (!user) throw new ApiError(404, "User not found");
    return Response.json({ user });
  } catch (e) {
    return apiError(e);
  }
}

/** Guards against removing the last active admin (self-lockout). */
async function assertAnotherActiveAdminExists(excludeUserId: string): Promise<void> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(users)
    .where(and(eq(users.role, "ADMIN"), eq(users.active, true), ne(users.id, excludeUserId)));
  if (Number(value) === 0) {
    throw new ApiError(409, "At least one active admin must remain");
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    await requireRole("ADMIN");
    const id = requireUuid((await ctx.params).id, "user id");
    const body = userUpdateSchema.parse(await readJson(req));

    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) throw new ApiError(404, "User not found");

    const losesAdmin = (body.role && body.role !== "ADMIN") || body.active === false;
    if (target.role === "ADMIN" && target.active && losesAdmin) {
      await assertAnotherActiveAdminExists(id);
    }

    const values: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
    if (body.email) values.email = body.email.toLowerCase().trim();
    if (body.name) values.name = body.name;
    if (body.role) values.role = body.role;
    if (body.active !== undefined) values.active = body.active;
    if (body.password) values.passwordHash = await bcrypt.hash(body.password, 12);

    const [updated] = await db.update(users).set(values).where(eq(users.id, id)).returning(publicColumns);
    return Response.json({ user: updated });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const me = await requireRole("ADMIN");
    const id = requireUuid((await ctx.params).id, "user id");
    if (id === me.id) throw new ApiError(400, "You cannot delete your own account");

    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) throw new ApiError(404, "User not found");
    if (target.role === "ADMIN" && target.active) await assertAnotherActiveAdminExists(id);

    await db.delete(users).where(eq(users.id, id));
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
