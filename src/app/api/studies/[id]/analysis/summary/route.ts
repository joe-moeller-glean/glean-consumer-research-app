import { NextRequest } from "next/server";
import { requireUser, apiError, requireUuid } from "@/lib/auth";
import { aggregateStudy } from "@/lib/aggregate";
import { latestAnalysis } from "@/lib/glean";

type Ctx = { params: Promise<{ id: string }> };

/** Chart data: overall, per-leg, and per-demographic sentiment breakdowns. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
    const studyId = requireUuid((await ctx.params).id, "study id");
    const [summary, analysis] = await Promise.all([aggregateStudy(studyId), latestAnalysis(studyId)]);
    return Response.json({ summary, latestAnalysis: analysis });
  } catch (e) {
    return apiError(e);
  }
}
