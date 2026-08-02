import { NextRequest } from "next/server";
import { eq, desc, and, ilike, count, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { responses, legs, panelists } from "@/db/schema";
import { requireUser, apiError, requireUuid } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

const SENTIMENTS = ["LIKE", "DISLIKE", "INDIFFERENT"] as const;
type Sentiment = (typeof SENTIMENTS)[number];

/** Paginated response browser: ?legId=&sentiment=&q=&limit=&offset= */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
    const studyId = requireUuid((await ctx.params).id, "study id");
    const sp = req.nextUrl.searchParams;

    const filters: SQL[] = [eq(responses.studyId, studyId)];
    const legId = sp.get("legId");
    if (legId) filters.push(eq(responses.legId, requireUuid(legId, "leg id")));
    const sentiment = sp.get("sentiment");
    if (sentiment && SENTIMENTS.includes(sentiment as Sentiment)) {
      filters.push(eq(responses.sentiment, sentiment as Sentiment));
    }
    const q = sp.get("q")?.trim();
    if (q) filters.push(ilike(responses.feedbackText, `%${q}%`));

    const where = and(...filters);
    const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "50", 10) || 50, 1), 200);
    const offset = Math.max(parseInt(sp.get("offset") ?? "0", 10) || 0, 0);

    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select({
          response: responses,
          legName: legs.name,
          panelistExternal: panelists.panelistId,
        })
        .from(responses)
        .leftJoin(legs, eq(responses.legId, legs.id))
        .leftJoin(panelists, eq(responses.panelistId, panelists.id))
        .where(where)
        .orderBy(desc(responses.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ value: count() }).from(responses).where(where),
    ]);

    return Response.json({ responses: rows, total: Number(total), limit, offset });
  } catch (e) {
    return apiError(e);
  }
}
