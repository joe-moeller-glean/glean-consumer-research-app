import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { studies } from "@/db/schema";
import { requireUser, canWrite, apiError, ApiError } from "@/lib/auth";
import { studyUpdateSchema } from "@/lib/validation";
import { removeStudyDir } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
    const { id } = await ctx.params;
    const rows = await db.query.studies.findFirst({
      where: eq(studies.id, id),
      with: {
        legs: { orderBy: (l, { asc }) => [asc(l.sequence)] },
        createdBy: { columns: { id: true, name: true, email: true } },
      },
    });
    if (!rows) throw new ApiError(404, "Study not found");
    return Response.json({ study: rows });
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const me = await requireUser();
    if (!canWrite(me.role)) throw new ApiError(403, "Forbidden");
    const { id } = await ctx.params;
    const body = studyUpdateSchema.parse(await req.json());
    const values: Partial<typeof studies.$inferInsert> = { ...body, updatedAt: new Date() };
    if (body.startDate !== undefined) values.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.endDate !== undefined) values.endDate = body.endDate ? new Date(body.endDate) : null;
    const [updated] = await db.update(studies).set(values).where(eq(studies.id, id)).returning();
    if (!updated) throw new ApiError(404, "Study not found");
    return Response.json({ study: updated });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const me = await requireUser();
    if (!canWrite(me.role)) throw new ApiError(403, "Forbidden");
    const { id } = await ctx.params;
    const [deleted] = await db.delete(studies).where(eq(studies.id, id)).returning({ id: studies.id });
    if (!deleted) throw new ApiError(404, "Study not found");
    await removeStudyDir(id);
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
