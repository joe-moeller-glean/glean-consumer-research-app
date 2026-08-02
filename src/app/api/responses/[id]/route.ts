import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { responses } from "@/db/schema";
import { requireUser, canWrite, apiError, ApiError } from "@/lib/auth";
import { responseUpdateSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

// Manual sentiment override
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const me = await requireUser();
    if (!canWrite(me.role)) throw new ApiError(403, "Forbidden");
    const { id } = await ctx.params;
    const body = responseUpdateSchema.parse(await req.json());
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
