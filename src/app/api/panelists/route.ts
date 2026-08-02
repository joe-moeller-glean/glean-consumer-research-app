import { NextRequest } from "next/server";
import { desc, sql, ilike, or, and, eq, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { panelists } from "@/db/schema";
import { requireUser, requireWriter, apiError, ApiError, readJson } from "@/lib/auth";
import { panelistCreateSchema } from "@/lib/validation";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const q = req.nextUrl.searchParams.get("q")?.trim();
    const stubsOnly = req.nextUrl.searchParams.get("stubs") === "1";

    const filters: SQL[] = [];
    if (q) {
      const like = `%${q}%`;
      const match = or(ilike(panelists.panelistId, like), ilike(panelists.city, like), ilike(panelists.state, like));
      if (match) filters.push(match);
    }
    if (stubsOnly) filters.push(eq(panelists.isStub, true));

    const rows = await db
      .select({
        panelist: panelists,
        studyCount: sql<number>`(SELECT count(*)::int FROM study_panelists sp WHERE sp.panelist_id = ${panelists.id})`,
        legCount: sql<number>`(SELECT count(*)::int FROM leg_panelists lp WHERE lp.panelist_id = ${panelists.id})`,
        responseCount: sql<number>`(SELECT count(*)::int FROM responses r WHERE r.panelist_id = ${panelists.id})`,
      })
      .from(panelists)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(panelists.createdAt));

    return Response.json({ panelists: rows });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireWriter();
    const body = panelistCreateSchema.parse(await readJson(req));

    const existing = await db
      .select({ id: panelists.id })
      .from(panelists)
      .where(eq(panelists.panelistId, body.panelistId))
      .limit(1);
    if (existing[0]) throw new ApiError(409, `Panelist ID "${body.panelistId}" already exists`);

    const [created] = await db.insert(panelists).values(body).returning();
    return Response.json({ panelist: created }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
