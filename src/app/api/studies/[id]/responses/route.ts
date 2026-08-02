import { NextRequest } from "next/server";
import { eq, desc, and, ilike, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { responses, legs } from "@/db/schema";
import { requireUser, apiError } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

// GET responses for a study with filters: ?legId=&sentiment=&q=&limit=&offset=
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
    const { id: studyId } = await ctx.params;
    const sp = req.nextUrl.searchParams;
    const conditions: SQL[] = [eq(responses.studyId, studyId)];
    const legId = sp.get("legId");
    const sentiment = sp.get("sentiment");
    const q = sp.get("q");
    if (legId) conditions.push(eq(responses.legId, legId));
    if (sentiment === "LIKE" || sentiment === "DISLIKE" || sentiment === "INDIFFERENT") {
      conditions.push(eq(responses.sentiment, sentiment));
    }
    if (q) conditions.push(ilike(responses.feedbackText, `%${q}%`));

    const limit = Math.min(parseInt(sp.get("limit") ?? "100", 10) || 100, 500);
    const offset = parseInt(sp.get("offset") ?? "0", 10) || 0;

    const rows = await db
      .select({
        response: responses,
        legName: legs.name,
      })
      .from(responses)
      .leftJoin(legs, eq(responses.legId, legs.id))
      .where(and(...conditions))
      .orderBy(desc(responses.createdAt))
      .limit(limit)
      .offset(offset);

    return Response.json({ responses: rows, limit, offset });
  } catch (e) {
    return apiError(e);
  }
}
