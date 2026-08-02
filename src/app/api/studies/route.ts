import { NextRequest } from "next/server";
import { desc, sql, and, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { studies, legs } from "@/db/schema";
import { requireUser, requireWriter, apiError, readJson } from "@/lib/auth";
import { studyCreateSchema } from "@/lib/validation";

const STUDY_STATUSES = ["DRAFT", "COLLECTING", "PROCESSING", "ANALYZED", "ARCHIVED"] as const;
type StudyStatus = (typeof STUDY_STATUSES)[number];

/** Study list with counts and a sentiment snapshot for the dashboard. */
export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const q = req.nextUrl.searchParams.get("q")?.trim();
    const status = req.nextUrl.searchParams.get("status")?.trim();

    const filters: SQL[] = [];
    if (q) {
      const like = `%${q}%`;
      const match = or(ilike(studies.name, like), ilike(studies.product, like));
      if (match) filters.push(match);
    }
    if (status && STUDY_STATUSES.includes(status as StudyStatus)) {
      filters.push(eq(studies.status, status as StudyStatus));
    }

    const rows = await db
      .select({
        study: studies,
        legCount: sql<number>`(SELECT count(*)::int FROM legs WHERE legs.study_id = ${studies.id})`,
        responseCount: sql<number>`(SELECT count(*)::int FROM responses WHERE responses.study_id = ${studies.id})`,
        likeCount: sql<number>`(SELECT count(*)::int FROM responses WHERE responses.study_id = ${studies.id} AND responses.sentiment = 'LIKE')`,
        dislikeCount: sql<number>`(SELECT count(*)::int FROM responses WHERE responses.study_id = ${studies.id} AND responses.sentiment = 'DISLIKE')`,
        indifferentCount: sql<number>`(SELECT count(*)::int FROM responses WHERE responses.study_id = ${studies.id} AND responses.sentiment = 'INDIFFERENT')`,
      })
      .from(studies)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(studies.createdAt));

    return Response.json({ studies: rows });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireWriter();
    const body = studyCreateSchema.parse(await readJson(req));

    const [created] = await db
      .insert(studies)
      .values({
        ...body,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        createdById: me.id,
      })
      .returning();

    // Every study needs at least one leg before data can be uploaded.
    await db.insert(legs).values({ studyId: created.id, name: "Leg 1", sequence: 1 });

    return Response.json({ study: created }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
