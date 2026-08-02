import { NextRequest } from "next/server";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { panelists } from "@/db/schema";
import { requireUser, canWrite, apiError, ApiError } from "@/lib/auth";
import { panelistCreateSchema } from "@/lib/validation";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase();
    const rows = await db
      .select({
        panelist: panelists,
        studyCount: sql<number>`(SELECT count(*) FROM study_panelists sp WHERE sp.panelist_id = ${panelists.id})`,
        legCount: sql<number>`(SELECT count(*) FROM leg_panelists lp WHERE lp.panelist_id = ${panelists.id})`,
        responseCount: sql<number>`(SELECT count(*) FROM responses r WHERE r.panelist_id = ${panelists.id})`,
      })
      .from(panelists)
      .orderBy(desc(panelists.createdAt));
    const out = q
      ? rows.filter((r) => r.panelist.panelistId.toLowerCase().includes(q) || (r.panelist.city ?? "").toLowerCase().includes(q))
      : rows;
    return Response.json({ panelists: out });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireUser();
    if (!canWrite(me.role)) throw new ApiError(403, "Forbidden");
    const body = panelistCreateSchema.parse(await req.json());
    const [created] = await db.insert(panelists).values(body).returning();
    return Response.json({ panelist: created }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
