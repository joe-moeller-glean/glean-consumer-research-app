import { NextRequest } from "next/server";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { studies, legs, responses } from "@/db/schema";
import { requireUser, canWrite, apiError, ApiError } from "@/lib/auth";
import { studyCreateSchema } from "@/lib/validation";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const q = req.nextUrl.searchParams.get("q")?.trim();
    const status = req.nextUrl.searchParams.get("status")?.trim();

    const rows = await db
      .select({
        study: studies,
        legCount: sql<number>`(SELECT count(*) FROM legs WHERE legs.study_id = ${studies.id})`,
        responseCount: sql<number>`(SELECT count(*) FROM responses WHERE responses.study_id = ${studies.id})`,
        likeCount: sql<number>`(SELECT count(*) FROM responses WHERE responses.study_id = ${studies.id} AND responses.sentiment = 'LIKE')`,
        dislikeCount: sql<number>`(SELECT count(*) FROM responses WHERE responses.study_id = ${studies.id} AND responses.sentiment = 'DISLIKE')`,
        indifferentCount: sql<number>`(SELECT count(*) FROM responses WHERE responses.study_id = ${studies.id} AND responses.sentiment = 'INDIFFERENT')`,
      })
      .from(studies)
      .orderBy(desc(studies.createdAt));

    let out = rows;
    if (q) {
      const needle = q.toLowerCase();
      out = out.filter(
        (r) =>
          r.study.name.toLowerCase().includes(needle) ||
          r.study.product.toLowerCase().includes(needle)
      );
    }
    if (status) out = out.filter((r) => r.study.status === status);

    return Response.json({ studies: out });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireUser();
    if (!canWrite(me.role)) throw new ApiError(403, "Viewers cannot create studies");
    const body = studyCreateSchema.parse(await req.json());
    const [created] = await db
      .insert(studies)
      .values({
        ...body,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        createdById: me.id,
      })
      .returning();
    // Auto-create a first leg so uploads have a target
    await db.insert(legs).values({ studyId: created.id, name: "Leg 1", sequence: 1 });
    return Response.json({ study: created }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
