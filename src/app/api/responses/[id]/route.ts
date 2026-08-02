import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { responses } from "@/db/schema";
import { requireWriter, apiError, ApiError, requireUuid, readJson } from "@/lib/auth";
import { responseUpdateSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Manual sentiment override. Sets sentimentOverridden so a later batch ingest
 * never overwrites a human decision.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    await requireWriter();
    const id = requireUuid((await ctx.params).id, "response id");
    const body = responseUpdateSchema.parse(await readJson(req));
    const [updated] = await db
      .update(responses)
      .set({
        sentiment: body.sentiment,
        sentimentScore: 1,
        sentimentModel: "manual",
        sentimentOverridden: true,
        flaggedForReview: false,
        analyzedAt: new Date(),
      })
      .where(eq(responses.id, id))
      .returning();
    if (!updated) throw new ApiError(404, "Response not found");
    return Response.json({ response: updated });
  } catch (e) {
    return apiError(e);
  }
}
