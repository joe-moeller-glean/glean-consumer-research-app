import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/lib/env";

export const QUEUE_NAME = "study-pipeline";

export type JobData =
  | { type: "parse"; studyDataId: string }
  | { type: "sentiment-batch"; batchId: string }
  | { type: "aggregate"; studyId: string }
  | { type: "glean-analysis"; analysisId: string };

let connection: IORedis | null = null;

export function getConnection(): IORedis {
  if (!connection) {
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

export async function enqueue(data: JobData): Promise<void> {
  await getQueue().add(data.type, data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}

export { Worker, type Job };
