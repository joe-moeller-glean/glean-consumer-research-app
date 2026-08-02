import { NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { studyData } from "@/db/schema";
import { requireUser, canWrite, apiError, ApiError } from "@/lib/auth";
import { removeFile } from "@/lib/storage";
import { readFile } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
    const { id } = await ctx.params;
    if (req.nextUrl.searchParams.get("download") === "1") {
      const rows = await db.select().from(studyData).where(eq(studyData.id, id)).limit(1);
      const file = rows[0];
      if (!file) throw new ApiError(404, "File not found");
      const buf = await readFile(file.storagePath);
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": file.fileType === "ZIP" ? "application/zip" : "text/csv",
          "Content-Disposition": `attachment; filename="${file.storedFilename}"`,
        },
      });
    }
    const rows = await db.select().from(studyData).where(eq(studyData.id, id)).limit(1);
    if (!rows[0]) throw new ApiError(404, "File not found");
    return Response.json({ file: rows[0] });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const me = await requireUser();
    if (!canWrite(me.role)) throw new ApiError(403, "Forbidden");
    const { id } = await ctx.params;
    const [deleted] = await db.delete(studyData).where(eq(studyData.id, id)).returning();
    if (!deleted) throw new ApiError(404, "File not found");
    await removeFile(deleted.storagePath);
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
