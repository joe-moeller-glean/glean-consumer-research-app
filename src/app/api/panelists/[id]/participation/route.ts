import { NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { responses, studies, legs } from "@/db/schema";
import { requireUser, apiError, requireUuid } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** Which studies and legs this panelist took part in, with their responses. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
    const id = requireUuid((await ctx.params).id, "panelist id");
    const participation = await db
      .select({
        response: responses,
        study: {
          id: studies.id,
          name: studies.name,
          product: studies.product,
          productVersion: studies.productVersion,
        },
        leg: { id: legs.id, name: legs.name, sequence: legs.sequence },
      })
      .from(responses)
      .innerJoin(studies, eq(responses.studyId, studies.id))
      .innerJoin(legs, eq(responses.legId, legs.id))
      .where(eq(responses.panelistId, id))
      .orderBy(desc(responses.createdAt))
      .limit(200);
    return Response.json({ participation });
  } catch (e) {
    return apiError(e);
  }
}
