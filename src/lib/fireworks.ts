import fs from "fs/promises";
import path from "path";
import os from "os";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { db } from "@/db";
import { responses, sentimentBatches } from "@/db/schema";
import { env, fireworksConfigured } from "@/lib/env";
import { sentimentOutputSchema } from "@/lib/validation";

/**
 * Fireworks Batch Inference client.
 * Docs: https://docs.fireworks.ai/guides/batch-inference
 *
 * Split into two steps so no job blocks a worker slot while a batch runs
 * (batches take minutes to hours):
 *   submitBatch() -> upload dataset + create job
 *   pollBatch()   -> check state, ingest results when terminal
 *
 * The model is whatever FIREWORKS_MODEL points at, which is how the fine-tuned
 * sentiment model is swapped in without a code change.
 */

export const SENTIMENT_SYSTEM_PROMPT = `You are a consumer research sentiment classifier. Classify the consumer feedback the user provides into exactly one sentiment: "like", "dislike", or "indifferent".
- "like": a positive reaction, preference, enjoyment, or approval.
- "dislike": a negative reaction, aversion, complaint, or disapproval.
- "indifferent": neutral, mixed, unsure, or no clear preference.
Respond with ONLY a JSON object and no other text: {"sentiment": "like"|"dislike"|"indifferent", "confidence": <number between 0 and 1>}`;

export type BatchState = "VALIDATING" | "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "EXPIRED";
export type SentimentValue = "LIKE" | "DISLIKE" | "INDIFFERENT";

const TERMINAL: BatchState[] = ["COMPLETED", "FAILED", "EXPIRED"];

// ---------------------------------------------------------------- HTTP helpers

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.fireworksApiKey}`,
    "Content-Type": "application/json",
  };
}

function accountBase(): string {
  return `${env.fireworksBaseUrl}/v1/accounts/${env.fireworksAccountId}`;
}

/** Fireworks resource ids must be lowercase alphanumeric + dashes. */
export function datasetIdForBatch(batchId: string): string {
  return `cr-${batchId.toLowerCase().replace(/[^a-z0-9]/g, "")}`.slice(0, 60);
}

async function fwFetch(url: string, init: RequestInit, what: string): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`Fireworks ${what} failed (${res.status}): ${(await res.text()).slice(0, 500)}`);
  }
  return res;
}

// ---------------------------------------------------------- Dataset + job APIs

async function createDataset(datasetId: string): Promise<void> {
  const res = await fetch(`${accountBase()}/datasets?datasetId=${encodeURIComponent(datasetId)}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ dataset: { userUploaded: {} } }),
  });
  // 409 = dataset already exists, which is safe when a job is retried.
  if (!res.ok && res.status !== 409) {
    throw new Error(`Fireworks create dataset failed (${res.status}): ${(await res.text()).slice(0, 500)}`);
  }
}

async function uploadDataset(datasetId: string, jsonlPath: string): Promise<void> {
  const buf = await fs.readFile(jsonlPath);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "application/jsonl" }), path.basename(jsonlPath));
  await fwFetch(
    `${accountBase()}/datasets/${encodeURIComponent(datasetId)}:upload`,
    { method: "POST", headers: { Authorization: `Bearer ${env.fireworksApiKey}` }, body: form },
    "dataset upload"
  );
}

async function createBatchJob(jobId: string, inputDatasetId: string, outputDatasetId: string): Promise<void> {
  await fwFetch(
    `${accountBase()}/batchInferenceJobs?batchInferenceJobId=${encodeURIComponent(jobId)}`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        model: env.fireworksModel,
        inputDatasetId: `accounts/${env.fireworksAccountId}/datasets/${inputDatasetId}`,
        outputDatasetId: `accounts/${env.fireworksAccountId}/datasets/${outputDatasetId}`,
        // A job-level system prompt keeps every row's prefix byte-identical,
        // which preserves prompt caching and shrinks the uploaded dataset.
        systemPrompt: SENTIMENT_SYSTEM_PROMPT,
        inferenceParameters: { maxTokens: 32, temperature: 0 },
      }),
    },
    "create batch job"
  );
}

async function getBatchJob(jobId: string): Promise<{ state: BatchState; message?: string }> {
  const res = await fwFetch(
    `${accountBase()}/batchInferenceJobs/${encodeURIComponent(jobId)}`,
    { headers: authHeaders() },
    "get batch job"
  );
  const json = (await res.json()) as { state?: BatchState; status?: { message?: string } };
  return { state: json.state ?? "PENDING", message: json.status?.message };
}

async function downloadResults(outputDatasetId: string): Promise<{ results: string; errors: string }> {
  const res = await fwFetch(
    `${accountBase()}/datasets/${encodeURIComponent(outputDatasetId)}:getDownloadEndpoint`,
    { method: "POST", headers: authHeaders(), body: JSON.stringify({}) },
    "get download endpoint"
  );
  const json = (await res.json()) as { filenameToSignedUrls?: Record<string, string> };
  let results = "";
  let errors = "";
  for (const [name, url] of Object.entries(json.filenameToSignedUrls ?? {})) {
    const fileRes = await fetch(url);
    if (!fileRes.ok) continue;
    const text = await fileRes.text();
    if (/error/i.test(name)) errors += text;
    else results += text;
  }
  return { results, errors };
}

// ------------------------------------------------- Pure helpers (unit tested)

export type PendingRow = { id: string; feedbackText: string };
export type ParsedSentiment = { sentiment: SentimentValue; confidence: number };

/**
 * Build request lines for the batch dataset. Identical verbatims are submitted
 * once and the result is fanned back out at ingest time to save tokens.
 */
export function buildJsonlLines(rows: PendingRow[]): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const r of rows) {
    const text = r.feedbackText.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(
      JSON.stringify({
        custom_id: r.id,
        body: {
          messages: [{ role: "user", content: text.slice(0, 8000) }],
          max_tokens: 32,
          temperature: 0,
        },
      })
    );
  }
  return lines;
}

/** Tolerant parse of model output: handles code fences and surrounding prose. */
export function extractSentiment(content: string): ParsedSentiment | null {
  const cleaned = content.replace(/```json/gi, "").replace(/```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = sentimentOutputSchema.safeParse(JSON.parse(match[0]));
    if (!parsed.success) return null;
    return { sentiment: parsed.data.sentiment, confidence: parsed.data.confidence ?? 0.5 };
  } catch {
    return null;
  }
}

/** Parse a results JSONL body into custom_id -> sentiment | error. */
export function parseResultsJsonl(jsonl: string): Map<string, ParsedSentiment | { error: true }> {
  const map = new Map<string, ParsedSentiment | { error: true }>();
  for (const line of jsonl.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed) as {
        custom_id?: string;
        response?: { body?: { choices?: Array<{ message?: { content?: string } }> } };
      };
      if (!obj.custom_id) continue;
      const content = obj.response?.body?.choices?.[0]?.message?.content;
      const parsed = content ? extractSentiment(content) : null;
      map.set(obj.custom_id, parsed ?? { error: true });
    } catch {
      // Ignore malformed lines rather than failing the whole batch.
    }
  }
  return map;
}

// --------------------------------------- Mock classifier (demo without a key)

const POSITIVE = ["love", "great", "good", "like", "amazing", "excellent", "tasty", "delicious", "enjoy", "favorite", "best", "smooth", "refreshing", "perfect"];
const NEGATIVE = ["hate", "bad", "terrible", "awful", "dislike", "gross", "worst", "bland", "bitter", "stale", "disappointing", "nasty", "weird"];

export function mockClassify(text: string): ParsedSentiment {
  const t = text.toLowerCase();
  const pos = POSITIVE.filter((w) => t.includes(w)).length;
  const neg = NEGATIVE.filter((w) => t.includes(w)).length;
  if (pos > neg) return { sentiment: "LIKE", confidence: 0.85 };
  if (neg > pos) return { sentiment: "DISLIKE", confidence: 0.85 };
  return { sentiment: "INDIFFERENT", confidence: 0.55 };
}

// ------------------------------------------------------------ Pipeline steps

async function loadBatch(batchId: string) {
  const rows = await db.select().from(sentimentBatches).where(eq(sentimentBatches.id, batchId)).limit(1);
  if (!rows[0]) throw new Error(`SentimentBatch not found: ${batchId}`);
  return rows[0];
}

/** Responses still awaiting a sentiment within this batch's scope. */
async function pendingRows(batch: { studyId: string; studyDataId: string | null }): Promise<PendingRow[]> {
  const scope = batch.studyDataId
    ? and(eq(responses.studyDataId, batch.studyDataId), isNull(responses.sentiment))
    : and(eq(responses.studyId, batch.studyId), isNull(responses.sentiment));
  return db.select({ id: responses.id, feedbackText: responses.feedbackText }).from(responses).where(scope);
}

/**
 * Step 1: upload the dataset and start the batch job.
 * Returns done=true when the batch finished immediately (mock mode / no rows).
 */
export async function submitBatch(batchId: string): Promise<{ done: boolean }> {
  const batch = await loadBatch(batchId);
  const rows = await pendingRows(batch);

  if (rows.length === 0) {
    await finishBatch(batchId, "COMPLETED");
    return { done: true };
  }

  // Mock mode keeps the app demoable without Fireworks credentials.
  if (!fireworksConfigured()) {
    if (!env.sentimentMock) {
      throw new Error(
        "Fireworks is not configured. Set FIREWORKS_API_KEY and FIREWORKS_ACCOUNT_ID, or SENTIMENT_MOCK=true for local demos."
      );
    }
    const results = new Map<string, ParsedSentiment | { error: true }>(
      rows.map((r) => [r.id, mockClassify(r.feedbackText)])
    );
    await db.update(sentimentBatches).set({ requestCount: rows.length }).where(eq(sentimentBatches.id, batchId));
    await applyResults(batchId, results, "mock");
    await finishBatch(batchId, "COMPLETED");
    return { done: true };
  }

  const lines = buildJsonlLines(rows);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cr-batch-"));
  const jsonlPath = path.join(tmpDir, `${batchId}.jsonl`);
  try {
    await fs.writeFile(jsonlPath, lines.join("\n") + "\n");

    const inputDatasetId = datasetIdForBatch(batchId);
    const outputDatasetId = `${inputDatasetId}-out`;

    await db
      .update(sentimentBatches)
      .set({
        status: "VALIDATING",
        requestCount: lines.length,
        inputDatasetId,
        outputDatasetId,
        fireworksJobId: inputDatasetId,
      })
      .where(eq(sentimentBatches.id, batchId));

    await createDataset(inputDatasetId);
    await uploadDataset(inputDatasetId, jsonlPath);
    await createBatchJob(inputDatasetId, inputDatasetId, outputDatasetId);

    await db.update(sentimentBatches).set({ status: "PENDING" }).where(eq(sentimentBatches.id, batchId));
    console.log(`[sentiment] batch ${batchId} submitted: ${lines.length} requests, model=${env.fireworksModel}`);
    return { done: false };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Step 2: check job state. Ingests results and returns done=true once the job
 * reaches a terminal state (or the expiry window elapses).
 */
export async function pollBatch(batchId: string): Promise<{ done: boolean; state: BatchState }> {
  const batch = await loadBatch(batchId);
  if (TERMINAL.includes(batch.status as BatchState)) {
    return { done: true, state: batch.status as BatchState };
  }
  if (!batch.fireworksJobId || !batch.outputDatasetId) {
    throw new Error(`Batch ${batchId} was never submitted`);
  }

  const { state, message } = await getBatchJob(batch.fireworksJobId);
  const expiredByClock =
    Date.now() - batch.submittedAt.getTime() > env.fireworksBatchExpiryHours * 3_600_000;

  if (state === "COMPLETED") {
    await ingestBatch(batchId, batch.outputDatasetId);
    await finishBatch(batchId, "COMPLETED");
    return { done: true, state };
  }
  if (state === "FAILED") {
    await finishBatch(batchId, "FAILED", message ?? "Batch job failed");
    return { done: true, state };
  }
  if (state === "EXPIRED" || expiredByClock) {
    // Rows that finished before expiry are still in the output dataset.
    await ingestBatch(batchId, batch.outputDatasetId).catch(() => undefined);
    await finishBatch(batchId, "EXPIRED", "Job expired; partial results ingested");
    return { done: true, state: "EXPIRED" };
  }

  await db.update(sentimentBatches).set({ status: state }).where(eq(sentimentBatches.id, batchId));
  return { done: false, state };
}

async function ingestBatch(batchId: string, outputDatasetId: string): Promise<void> {
  const { results, errors } = await downloadResults(outputDatasetId);
  const parsed = parseResultsJsonl(results);
  for (const line of errors.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed) as { custom_id?: string };
      if (obj.custom_id) parsed.set(obj.custom_id, { error: true });
    } catch {
      // ignore malformed error lines
    }
  }
  await applyResults(batchId, parsed, env.fireworksModel);
}

/**
 * Write sentiments back to responses. Results are keyed by the submitted row and
 * fanned out to every response with identical feedback text. Manual overrides are
 * never clobbered. Updates are grouped per sentiment instead of one query per row.
 */
async function applyResults(
  batchId: string,
  parsed: Map<string, ParsedSentiment | { error: true }>,
  model: string
): Promise<void> {
  const batch = await loadBatch(batchId);
  const scope = batch.studyDataId
    ? eq(responses.studyDataId, batch.studyDataId)
    : eq(responses.studyId, batch.studyId);

  const rows = await db
    .select({
      id: responses.id,
      feedbackText: responses.feedbackText,
      sentiment: responses.sentiment,
      overridden: responses.sentimentOverridden,
    })
    .from(responses)
    .where(scope);

  const byId = new Map(rows.map((r) => [r.id, r]));
  const resultByText = new Map<string, ParsedSentiment | { error: true }>();
  for (const [id, result] of parsed) {
    const row = byId.get(id);
    if (row) resultByText.set(row.feedbackText.trim().toLowerCase(), result);
  }

  const buckets: Record<SentimentValue, string[]> = { LIKE: [], DISLIKE: [], INDIFFERENT: [] };
  const flagged: string[] = [];

  for (const row of rows) {
    if (row.overridden || row.sentiment) continue;
    const result = resultByText.get(row.feedbackText.trim().toLowerCase());
    if (!result) continue;
    if ("error" in result) {
      flagged.push(row.id);
      continue;
    }
    buckets[result.sentiment].push(row.id);
    if (result.confidence < 0.4) flagged.push(row.id);
  }

  const analyzedAt = new Date();
  const sentiments: SentimentValue[] = ["LIKE", "DISLIKE", "INDIFFERENT"];
  for (const sentiment of sentiments) {
    const ids = buckets[sentiment];
    if (ids.length === 0) continue;
    await db
      .update(responses)
      .set({ sentiment, sentimentModel: model, analyzedAt })
      .where(inArray(responses.id, ids));
  }
  if (flagged.length > 0) {
    await db.update(responses).set({ flaggedForReview: true }).where(inArray(responses.id, flagged));
  }

  const applied = buckets.LIKE.length + buckets.DISLIKE.length + buckets.INDIFFERENT.length;
  console.log(`[sentiment] batch ${batchId}: applied=${applied} flagged=${flagged.length} model=${model}`);
}

async function finishBatch(batchId: string, status: BatchState, error?: string): Promise<void> {
  await db
    .update(sentimentBatches)
    .set({ status, error: error ?? null, completedAt: new Date() })
    .where(eq(sentimentBatches.id, batchId));
}
