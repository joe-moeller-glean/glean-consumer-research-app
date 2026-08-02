import { NextRequest } from "next/server";
import { eq, sql, asc } from "drizzle-orm";
import { db } from "@/db";
import { panelists, studyPanelists } from "@/db/schema";
import { requireUser, apiError, requireUuid } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** Panelists linked to a study, with the legs each participated in. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
    const studyId = requireUuid((await ctx.params).id, "study id");

    const rows = await db
      .select({
        panelist: panelists,
        legNames: sql<string[]>`(
          SELECT coalesce(array_agg(l.name ORDER BY l.sequence), '{}')
          FROM leg_panelists lp
          JOIN legs l ON l.id = lp.leg_id
          WHERE lp.panelist_id = ${panelists.id} AND l.study_id = ${studyId}
        )`,
        responseCount: sql<number>`(
          SELECT count(*)::int FROM responses r
          WHERE r.panelist_id = ${panelists.id} AND r.study_id = ${studyId}
        )`,
      })
      .from(studyPanelists)
      .innerJoin(panelists, eq(studyPanelists.panelistId, panelists.id))
      .where(eq(studyPanelists.studyId, studyId))
      .orderBy(asc(panelists.panelistId));

    return Response.json({ panelists: rows });
  } catch (e) {
    return apiError(e);
  }
}
