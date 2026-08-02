import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { legs } from "@/db/schema";
import { requireUser, canWrite, apiError, ApiError } from "@/lib/auth";
import { legCreateSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const me = await requireUser();
    if (!canWrite(me.role)) throw new ApiError(403, "Forbidden");
    const { id: studyId } = await ctx.params;
    const body = legCreateSchema.parse(await req.json());
    const [created] = await db.insert(legs).values({ ...body, studyId }).returning();
    return Response.json({ leg: created }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
