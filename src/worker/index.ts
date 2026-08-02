import { Worker, type Job } from "bullmq";
import { QUEUE_NAME, getConnection, enqueue, type JobData } from "@/lib/queue";
import { runParseJob } from "@/lib/parseJob";
import { runSentimentBatch } from "@/lib/fireworks";
import { runGleanAnalysis } from "@/lib/aggregate";
import { db, pool } from "@/db";
import { studyData, sentimentBatches, studies } from "@/db/schema";
import { eq, and, isNull, ne, sql } from "drizzle-orm";

async function handle(job: Job<JobData>): Promise<void> {
  const data = job.data;
  switch (data.type) {
    case "parse": {
      await runParseJob(data.studyDataId);
      // Chain: after parse, kick off sentiment batch for this file's rows
      const files = await db.select().from(studyData).where(eq(studyData.id, data.studyDataId)).limit(1);
      const file = files[0];
      if (file && file.status === "PARSED" && (file.rowCount ?? 0) > 0) {
        const [batch] = await db
          .insert(sentimentBatches)
          .values({ studyId: file.studyId, studyDataId: file.id })
          .returning({ id: sentimentBatches.id });
        await db.update(studyData).set({ status: "PROCESSING" }).where(eq(studyData.id, file.id));
        await db
          .update(studies)
          .set({ status: "PROCESSING", updatedAt: new Date() })
          .where(eq(studies.id, file.studyId));
        await enqueue({ type: "sentiment-batch", batchId: batch.id });
      }
      break;
    }

    case "sentiment-batch": {
      await runSentimentBatch(data.batchId);
      await enqueue({ type: "aggregate", studyId: "" + (await studyForBatch(data.batchId)) });
      break;
    }

    case "aggregate": {
      const studyId = data.studyId;
      // Mark the upload complete when its batch is done
      await db.execute(sql`
        UPDATE study_data sd
        SET status = 'COMPLETE'
        FROM sentiment_batches sb
        WHERE sb.study_data_id = sd.id
          AND sb.id IN (SELECT id FROM sentiment_batches WHERE study_id = ${studyId} AND status IN ('COMPLETED','FAILED','EXPIRED'))
          AND sd.status = 'PROCESSING'
      `);
      // Study becomes ANALYZED when no files remain in flight
      const inflight = await db
        .select({ id: studyData.id })
        .from(studyData)
        .where(and(eq(studyData.studyId, studyId), ne(studyData.status, "COMPLETE"), ne(studyData.status, "FAILED")))
        .limit(1);
      if (inflight.length === 0) {
        const hasAnalyzed = await db.execute(sql`SELECT 1 FROM responses WHERE study_id = ${studyId} AND sentiment IS NOT NULL LIMIT 1`);
        if (hasAnalyzed.rows.length > 0) {
          await db.update(studies).set({ status: "ANALYZED", updatedAt: new Date() }).where(eq(studies.id, studyId));
        }
      }
      break;
    }

    case "glean-analysis": {
      await runGleanAnalysis(data.analysisId);
      break;
    }
  }
}

async function studyForBatch(batchId: string): Promise<string> {
  const rows = await db.select({ studyId: sentimentBatches.studyId }).from(sentimentBatches).where(eq(sentimentBatches.id, batchId)).limit(1);
  return rows[0]?.studyId ?? "";
}

async function main() {
  console.log("[worker] starting, queue:", QUEUE_NAME);
  const worker = new Worker<JobData>(QUEUE_NAME, handle, {
    connection: getConnection(),
    concurrency: 2,
  });

  worker.on("completed", (job) => console.log(`[worker] job ${job.id} (${job.data.type}) completed`));
  worker.on("failed", (job, err) => console.error(`[worker] job ${job?.id} (${job?.data.type}) failed:`, err.message));

  const shutdown = async () => {
    console.log("[worker] shutting down");
    await worker.close();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
