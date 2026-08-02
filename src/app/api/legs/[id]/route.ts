import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { legs } from "@/db/schema";
import { requireUser, canWrite, apiError, ApiError } from "@/lib/auth";
import { legUpdateSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const me = await requireUser();
    if (!canWrite(me.role)) throw new ApiError(403, "Forbidden");
    const { id } = await ctx.params;
    const body = legUpdateSchema.parse(await req.json());
    const [updated] = await db
      .update(legs)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(legs.id, id))
      .returning();
    if (!updated) throw new ApiError(404, "Leg not found");
    return Response.json({ leg: updated });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const me = await requireUser();
    if (!canWrite(me.role)) throw new ApiError(403, "Forbidden");
    const { id } = await ctx.params;
    const [deleted] = await db.delete(legs).where(eq(legs.id, id)).returning({ id: legs.id });
    if (!deleted) throw new ApiError(404, "Leg not found");
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
