import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/lib/env";

export const QUEUE_NAME = "study-pipeline";

/**
 * Pipeline stages. Sentiment is split into submit + poll so a long-running
 * Fireworks batch never occupies a worker slot while it waits.
 */
export type JobData =
  | { type: "parse"; studyDataId: string }
  | { type: "sentiment-submit"; batchId: string }
  | { type: "sentiment-poll"; batchId: string }
  | { type: "finalize"; studyId: string }
  | { type: "glean-analysis"; analysisId: string };

let connection: IORedis | null = null;

export function getConnection(): IORedis {
  if (!connection) {
    // BullMQ requires maxRetriesPerRequest: null on its Redis connection.
    connection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
  }
  return connection;
}

let queue: Queue<JobData> | null = null;

export function getQueue(): Queue<JobData> {
  if (!queue) {
    queue = new Queue<JobData>(QUEUE_NAME, { connection: getConnection() });
  }
  return queue;
}

export async function enqueue(data: JobData, opts: { delayMs?: number } = {}): Promise<void> {
  await getQueue().add(data.type, data, {
    delay: opts.delayMs,
    // Submitting a batch twice would create duplicate Fireworks datasets, so
    // submissions are not retried automatically; polling is safe to retry.
    attempts: data.type === "sentiment-submit" ? 1 : 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}

export { Worker, type Job };
