import { eq, and, ne, isNotNull } from "drizzle-orm";
import { db, pool } from "@/db";
import { studyData, sentimentBatches, studies, responses } from "@/db/schema";
import { QUEUE_NAME, getConnection, enqueue, Worker, type Job, type JobData } from "@/lib/queue";
import { runParseJob } from "@/lib/parseJob";
import { submitBatch, pollBatch } from "@/lib/fireworks";
import { runGleanAnalysis } from "@/lib/glean";
import { env } from "@/lib/env";

/**
 * Background pipeline:
 *   parse -> sentiment-submit -> sentiment-poll (repeats) -> finalize
 *   glean-analysis runs on demand from the study page.
 */

async function onParse(studyDataId: string): Promise<void> {
  await runParseJob(studyDataId);

  const [file] = await db.select().from(studyData).where(eq(studyData.id, studyDataId)).limit(1);
  if (!file || file.status !== "PARSED" || (file.rowCount ?? 0) === 0) return;

  const [batch] = await db
    .insert(sentimentBatches)
    .values({ studyId: file.studyId, studyDataId: file.id })
    .returning({ id: sentimentBatches.id });

  await db.update(studyData).set({ status: "PROCESSING" }).where(eq(studyData.id, file.id));
  await db
    .update(studies)
    .set({ status: "PROCESSING", updatedAt: new Date() })
    .where(eq(studies.id, file.studyId));

  await enqueue({ type: "sentiment-submit", batchId: batch.id });
}

async function onSentimentSubmit(batchId: string): Promise<void> {
  const { done } = await submitBatch(batchId);
  if (done) {
    await enqueue({ type: "finalize", studyId: await studyIdForBatch(batchId) });
  } else {
    await enqueue({ type: "sentiment-poll", batchId }, { delayMs: env.fireworksPollIntervalMs });
  }
}

async function onSentimentPoll(batchId: string): Promise<void> {
  const { done } = await pollBatch(batchId);
  if (done) {
    await enqueue({ type: "finalize", studyId: await studyIdForBatch(batchId) });
  } else {
    await enqueue({ type: "sentiment-poll", batchId }, { delayMs: env.fireworksPollIntervalMs });
  }
}

/**
 * Mark uploads complete once their batch reached a terminal state, then promote
 * the study to ANALYZED when nothing is still in flight.
 */
async function onFinalize(studyId: string): Promise<void> {
  const batches = await db
    .select({ studyDataId: sentimentBatches.studyDataId, status: sentimentBatches.status })
    .from(sentimentBatches)
    .where(eq(sentimentBatches.studyId, studyId));

  const terminal = new Set(["COMPLETED", "FAILED", "EXPIRED"]);
  for (const batch of batches) {
    if (!batch.studyDataId || !terminal.has(batch.status)) continue;
    await db
      .update(studyData)
      .set({ status: "COMPLETE" })
      .where(and(eq(studyData.id, batch.studyDataId), eq(studyData.status, "PROCESSING")));
  }

  const inFlight = await db
    .select({ id: studyData.id })
    .from(studyData)
    .where(
      and(
        eq(studyData.studyId, studyId),
        ne(studyData.status, "COMPLETE"),
        ne(studyData.status, "FAILED")
      )
    )
    .limit(1);
  if (inFlight.length > 0) return;

  const analyzed = await db
    .select({ id: responses.id })
    .from(responses)
    .where(and(eq(responses.studyId, studyId), isNotNull(responses.sentiment)))
    .limit(1);
  if (analyzed.length === 0) return;

  await db.update(studies).set({ status: "ANALYZED", updatedAt: new Date() }).where(eq(studies.id, studyId));
}

async function studyIdForBatch(batchId: string): Promise<string> {
  const [row] = await db
    .select({ studyId: sentimentBatches.studyId })
    .from(sentimentBatches)
    .where(eq(sentimentBatches.id, batchId))
    .limit(1);
  if (!row) throw new Error(`SentimentBatch not found: ${batchId}`);
  return row.studyId;
}

async function handle(job: Job<JobData>): Promise<void> {
  switch (job.data.type) {
    case "parse":
      return onParse(job.data.studyDataId);
    case "sentiment-submit":
      return onSentimentSubmit(job.data.batchId);
    case "sentiment-poll":
      return onSentimentPoll(job.data.batchId);
    case "finalize":
      return onFinalize(job.data.studyId);
    case "glean-analysis":
      return runGleanAnalysis(job.data.analysisId);
  }
}

function main(): void {
  console.log(`[worker] listening on "${QUEUE_NAME}"`);
  console.log(`[worker] sentiment model: ${env.sentimentMock ? "mock (SENTIMENT_MOCK=true)" : env.fireworksModel}`);

  const worker = new Worker<JobData>(QUEUE_NAME, handle, {
    connection: getConnection(),
    concurrency: 2,
  });

  worker.on("completed", (job) => console.log(`[worker] ${job.data.type} ${job.id} completed`));
  worker.on("failed", (job, err) => console.error(`[worker] ${job?.data.type} ${job?.id} failed: ${err.message}`));

  const shutdown = async () => {
    console.log("[worker] shutting down");
    await worker.close();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main();
