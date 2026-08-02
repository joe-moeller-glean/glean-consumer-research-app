import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { legs, studies } from "@/db/schema";
import { requireWriter, apiError, ApiError, requireUuid, readJson } from "@/lib/auth";
import { legCreateSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    await requireWriter();
    const studyId = requireUuid((await ctx.params).id, "study id");
    const [study] = await db.select({ id: studies.id }).from(studies).where(eq(studies.id, studyId)).limit(1);
    if (!study) throw new ApiError(404, "Study not found");

    const body = legCreateSchema.parse(await readJson(req));
    const [created] = await db.insert(legs).values({ ...body, studyId }).returning();
    return Response.json({ leg: created }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
