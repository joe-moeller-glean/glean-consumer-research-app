import { NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { studyAnalyses } from "@/db/schema";
import { requireUser, requireWriter, apiError, requireUuid } from "@/lib/auth";
import { buildGleanPayload } from "@/lib/aggregate";
import { enqueue } from "@/lib/queue";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
    const studyId = requireUuid((await ctx.params).id, "study id");
    const analyses = await db
      .select()
      .from(studyAnalyses)
      .where(eq(studyAnalyses.studyId, studyId))
      .orderBy(desc(studyAnalyses.createdAt))
      .limit(10);
    return Response.json({ analyses });
  } catch (e) {
    return apiError(e);
  }
}

/** Queue a Glean overall-analysis run over the aggregated sentiment breakdown. */
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const me = await requireWriter();
    const studyId = requireUuid((await ctx.params).id, "study id");

    // Snapshot the aggregates now so the stored input matches what Glean saw.
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
