import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { panelists } from "@/db/schema";
import { requireUser, requireWriter, apiError, ApiError, requireUuid, readJson } from "@/lib/auth";
import { panelistUpdateSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
    const id = requireUuid((await ctx.params).id, "panelist id");
    const panelist = await db.query.panelists.findFirst({
      where: eq(panelists.id, id),
      with: {
        studyLinks: {
          with: {
            study: { columns: { id: true, name: true, product: true, productVersion: true, status: true } },
          },
        },
        legLinks: {
          with: { leg: { columns: { id: true, name: true, studyId: true, sequence: true } } },
        },
      },
    });
    if (!panelist) throw new ApiError(404, "Panelist not found");
    return Response.json({ panelist });
  } catch (e) {
    return apiError(e);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    await requireWriter();
    const id = requireUuid((await ctx.params).id, "panelist id");
    const body = panelistUpdateSchema.parse(await readJson(req));
    // Editing a stub panelist promotes it to a fully described record.
    const [updated] = await db
      .update(panelists)
      .set({ ...body, isStub: false, updatedAt: new Date() })
      .where(eq(panelists.id, id))
      .returning();
    if (!updated) throw new ApiError(404, "Panelist not found");
    return Response.json({ panelist: updated });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    await requireWriter();
    const id = requireUuid((await ctx.params).id, "panelist id");
    const [deleted] = await db.delete(panelists).where(eq(panelists.id, id)).returning({ id: panelists.id });
    if (!deleted) throw new ApiError(404, "Panelist not found");
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
