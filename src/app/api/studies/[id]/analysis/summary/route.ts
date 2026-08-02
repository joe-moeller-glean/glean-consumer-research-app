import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { studyAnalyses } from "@/db/schema";
import { requireUser, apiError, ApiError } from "@/lib/auth";
import { aggregateStudy, latestAnalysis } from "@/lib/aggregate";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
    const { id: studyId } = await ctx.params;
    const summary = await aggregateStudy(studyId);
    const latest = await latestAnalysis(studyId);
    return Response.json({ summary, latestAnalysis: latest });
  } catch (e) {
    return apiError(e);
  }
}
