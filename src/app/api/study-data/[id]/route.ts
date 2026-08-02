import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { studyData } from "@/db/schema";
import { requireUser, requireWriter, apiError, ApiError, requireUuid } from "@/lib/auth";
import { readFile, removeFile } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

/** File metadata, or the original upload when ?download=1. */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
    const id = requireUuid((await ctx.params).id, "file id");
    const [file] = await db.select().from(studyData).where(eq(studyData.id, id)).limit(1);
    if (!file) throw new ApiError(404, "File not found");

    if (req.nextUrl.searchParams.get("download") !== "1") {
      return Response.json({ file });
    }

    const buf = await readFile(file.storagePath);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": file.fileType === "ZIP" ? "application/zip" : "text/csv",
        // Quotes stripped: stored names are already sanitized by lib/storage.
        "Content-Disposition": `attachment; filename="${file.storedFilename.replace(/"/g, "")}"`,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}

/** Deletes the metadata row, its cascaded responses, and the file on disk. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    await requireWriter();
    const id = requireUuid((await ctx.params).id, "file id");
    const [deleted] = await db.delete(studyData).where(eq(studyData.id, id)).returning();
    if (!deleted) throw new ApiError(404, "File not found");
    await removeFile(deleted.storagePath);
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
