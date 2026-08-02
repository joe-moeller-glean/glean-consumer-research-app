import { NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { studyData, sentimentBatches } from "@/db/schema";
import { requireUser, apiError } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

// Uploads list + processing status for a study
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
    const { id: studyId } = await ctx.params;
    const files = await db
      .select()
      .from(studyData)
      .where(eq(studyData.studyId, studyId))
      .orderBy(desc(studyData.uploadedAt));
    const batches = await db
      .select()
      .from(sentimentBatches)
      .where(eq(sentimentBatches.studyId, studyId))
      .orderBy(desc(sentimentBatches.submittedAt));
    return Response.json({ files, batches });
  } catch (e) {
    return apiError(e);
  }
}
