import { NextRequest } from "next/server";
import { eq, count } from "drizzle-orm";
import { db } from "@/db";
import { legs, studyData } from "@/db/schema";
import { requireWriter, apiError, ApiError, requireUuid, readJson } from "@/lib/auth";
import { legUpdateSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    await requireWriter();
    const id = requireUuid((await ctx.params).id, "leg id");
    const body = legUpdateSchema.parse(await readJson(req));
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

/** Refuses to delete a leg that still has uploaded data, to avoid orphaning files. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    await requireWriter();
    const id = requireUuid((await ctx.params).id, "leg id");

    const [{ value: fileCount }] = await db
      .select({ value: count() })
      .from(studyData)
      .where(eq(studyData.legId, id));
    if (Number(fileCount) > 0) {
      throw new ApiError(409, "Leg still has uploaded data; delete those files first");
    }

    const [deleted] = await db.delete(legs).where(eq(legs.id, id)).returning({ id: legs.id });
    if (!deleted) throw new ApiError(404, "Leg not found");
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
