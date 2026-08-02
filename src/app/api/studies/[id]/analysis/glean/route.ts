import { NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { studyAnalyses } from "@/db/schema";
import { requireUser, canWrite, apiError } from "@/lib/auth";
import { buildGleanPayload } from "@/lib/aggregate";
import { enqueue } from "@/lib/queue";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
    const { id: studyId } = await ctx.params;
    const rows = await db
      .select()
      .from(studyAnalyses)
      .where(eq(studyAnalyses.studyId, studyId))
      .orderBy(desc(studyAnalyses.createdAt))
      .limit(10);
    return Response.json({ analyses: rows });
  } catch (e) {
    return apiError(e);
  }
}

// Trigger a Glean overall-analysis run
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const me = await requireUser();
    if (!canWrite(me.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id: studyId } = await ctx.params;
    const inputJson = await buildGleanPayload(studyId);
    const [created] = await db
      .insert(studyAnalyses)
      .values({ studyId, inputJson, createdById: me.id })
      .returning();
    await enqueue({ type: "glean-analysis", analysisId: created.id });
    return Response.json({ analysis: created }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
