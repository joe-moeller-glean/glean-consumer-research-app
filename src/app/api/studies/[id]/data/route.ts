import { NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { studyData, sentimentBatches } from "@/db/schema";
import { requireUser, apiError, requireUuid } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** Uploaded files plus Fireworks batch status, polled by the Data tab. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
    const studyId = requireUuid((await ctx.params).id, "study id");
    const [files, batches] = await Promise.all([
      db.select().from(studyData).where(eq(studyData.studyId, studyId)).orderBy(desc(studyData.uploadedAt)),
      db
        .select()
        .from(sentimentBatches)
        .where(eq(sentimentBatches.studyId, studyId))
        .orderBy(desc(sentimentBatches.submittedAt)),
    ]);
    return Response.json({ files, batches });
  } catch (e) {
    return apiError(e);
  }
}
