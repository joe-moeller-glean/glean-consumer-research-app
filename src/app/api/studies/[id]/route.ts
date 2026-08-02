import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { studies } from "@/db/schema";
import { requireUser, requireWriter, apiError, ApiError, requireUuid, readJson } from "@/lib/auth";
import { studyUpdateSchema } from "@/lib/validation";
import { removeStudyDir } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
    const id = requireUuid((await ctx.params).id, "study id");
    const study = await db.query.studies.findFirst({
      where: eq(studies.id, id),
      with: {
        legs: { orderBy: (l, { asc }) => [asc(l.sequence)] },
        createdBy: { columns: { id: true, name: true, email: true } },
      },
    });
    if (!study) throw new ApiError(404, "Study not found");
    return Response.json({ study });
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    await requireWriter();
    const id = requireUuid((await ctx.params).id, "study id");
    const body = studyUpdateSchema.parse(await readJson(req));

    // Dates arrive as ISO strings; strip them out before spreading into the row.
    const { startDate, endDate, ...rest } = body;
    const values: Partial<typeof studies.$inferInsert> = { ...rest, updatedAt: new Date() };
    if (startDate !== undefined) values.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) values.endDate = endDate ? new Date(endDate) : null;

    const [updated] = await db.update(studies).set(values).where(eq(studies.id, id)).returning();
    if (!updated) throw new ApiError(404, "Study not found");
    return Response.json({ study: updated });
  } catch (e) {
    return apiError(e);
  }
}

/** Deletes the study, its cascaded rows, and its uploaded files on disk. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    await requireWriter();
    const id = requireUuid((await ctx.params).id, "study id");
    const [deleted] = await db.delete(studies).where(eq(studies.id, id)).returning({ id: studies.id });
    if (!deleted) throw new ApiError(404, "Study not found");
    await removeStudyDir(id);
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
