import fs from "fs/promises";
import path from "path";
import os from "os";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { responses, sentimentBatches } from "@/db/schema";
import { env } from "@/lib/env";
import { sentimentOutputSchema } from "@/lib/validation";

/**
 * Fireworks Batch Inference API client.
 * Docs: https://docs.fireworks.ai/guides/batch-inference
 *
 * Flow: build JSONL dataset -> create+upload dataset -> create batchInferenceJob
 *       -> poll until COMPLETED/FAILED/EXPIRED -> download output dataset -> ingest.
 */

const SYSTEM_PROMPT = `You are a consumer research sentiment classifier. Classify the consumer feedback the user provides into exactly one sentiment: "like", "dislike", or "indifferent".
- "like": the consumer expresses a positive reaction, preference, enjoyment, or approval.
- "dislike": the consumer expresses a negative reaction, aversion, complaint, or disapproval.
- "indifferent": the consumer is neutral, mixed, unsure, or expresses no clear preference.
Respond with ONLY a JSON object, no other text: {"sentiment": "like"|"dislike"|"indifferent", "confidence": <number 0-1>}`;

type BatchJobState = "VALIDATING" | "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "EXPIRED";

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.fireworksApiKey}`,
    "Content-Type": "application/json",
  };
}

function accountBase(): string {
  return `${env.fireworksBaseUrl}/v1/accounts/${env.fireworksAccountId}`;
}

export function datasetIdForBatch(batchId: string): string {
  return `cr-batch-${batchId.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`.slice(0, 60);
}

async function createDatasetEntry(datasetId: string): Promise<void> {
  const res = await fetch(`${accountBase()}/datasets?datasetId=${encodeURIComponent(datasetId)}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ dataset: { userUploaded: {} } }),
  });
  if (!res.ok && res.status !== 409) {
    throw new Error(`Fireworks create dataset failed: ${res.status} ${await res.text()}`);
  }
}

async function uploadDatasetFile(datasetId: string, jsonlPath: string): Promise<void> {
  const buf = await fs.readFile(jsonlPath);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "application/jsonl" }), path.basename(jsonlPath));
  const res = await fetch(
    `${accountBase()}/datasets/${encodeURIComponent(datasetId)}:upload`,
    { method: "POST", headers: { Authorization: `Bearer ${env.fireworksApiKey}` }, body: form }
  );
  if (!res.ok) throw new Error(`Fireworks dataset upload failed: ${res.status} ${await res.text()}`);
}

async function createBatchJob(
  jobId: string,
  inputDatasetId: string,
  outputDatasetId: string
): Promise<void> {
  const res = await fetch(`${accountBase()}/batchInferenceJobs?batchInferenceJobId=${encodeURIComponent(jobId)}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: env.fireworksModel,
      inputDatasetId: `accounts/${env.fireworksAccountId}/datasets/${inputDatasetId}`,
      outputDatasetId: `accounts/${env.fireworksAccountId}/datasets/${outputDatasetId}`,
      systemPrompt: SYSTEM_PROMPT,
      inferenceParameters: { maxTokens: 32, temperature: 0 },
    }),
  });
  if (!res.ok) throw new Error(`Fireworks create batch job failed: ${res.status} ${await res.text()}`);
}

async function getBatchJob(jobId: string): Promise<{ state: BatchJobState; statusMessage?: string }> {
  const res = await fetch(`${accountBase()}/batchInferenceJobs/${encodeURIComponent(jobId)}`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Fireworks get batch job failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { state?: BatchJobState; status?: { message?: string } };
  return { state: json.state ?? "PENDING", statusMessage: json.status?.message };
}

async function downloadOutputDataset(outputDatasetId: string): Promise<{ results: string; errors: string }> {
  const res = await fetch(
    `${accountBase()}/datasets/${encodeURIComponent(outputDatasetId)}:getDownloadEndpoint`,
    { method: "POST", headers: headers(), body: JSON.stringify({}) }
  );
  if (!res.ok) throw new Error(`Fireworks get download endpoint failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { filenameToSignedUrls?: Record<string, string> };
  const files = json.filenameToSignedUrls ?? {};
  let results = "";
  let errors = "";
  for (const [name, url] of Object.entries(files)) {
    const fileRes = await fetch(url);
    if (!fileRes.ok) continue;
    const text = await fileRes.text();
    if (/error/i.test(name)) errors += text;
    else results += text;
  }
  return { results, errors };
}

// ---------------- JSONL dataset construction ----------------

type ResponseRow = { id: string; feedbackText: string };

export function buildJsonlLines(rows: ResponseRow[]): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const r of rows) {
    const key = r.feedbackText.trim().toLowerCase();
    if (seen.has(key)) continue; // dedupe identical verbatims; results fan back out
    seen.add(key);
    lines.push(
      JSON.stringify({
        custom_id: r.id,
        body: {
          messages: [{ role: "user", content: r.feedbackText.slice(0, 8000) }],
          max_tokens: 32,
          temperature: 0,
        },
      })
    );
  }
  return lines;
}

// ---------------- Result parsing ----------------

export type ParsedSentiment = { sentiment: "LIKE" | "DISLIKE" | "INDIFFERENT"; confidence: number };

export function extractSentiment(content: string): ParsedSentiment | null {
  const cleaned = content.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = sentimentOutputSchema.safeParse(JSON.parse(match[0]));
    if (!parsed.success) return null;
    return {
      sentiment: parsed.data.sentiment,
      confidence: parsed.data.confidence ?? 0.5,
    };
  } catch {
    return null;
  }
}

function parseResultsJsonl(
  jsonl: string
): Map<string, ParsedSentiment | { error: true }> {
  const map = new Map<string, ParsedSentiment | { error: true }>();
  for (const line of jsonl.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed) as {
        custom_id?: string;
        response?: { statusCode?: number; body?: { choices?: Array<{ message?: { content?: string } }> } };
        error?: unknown;
      };
      const id = obj.custom_id;
      if (!id) continue;
      const content = obj.response?.body?.choices?.[0]?.message?.content;
      if (content) {
        const parsed = extractSentiment(content);
        map.set(id, parsed ?? { error: true });
      } else {
        map.set(id, { error: true });
      }
    } catch {
      // skip malformed line
    }
  }
  return map;
}

// ---------------- Mock mode (dev/demo without Fireworks credentials) ----------------

const POSITIVE = ["love", "great", "good", "like", "amazing", "excellent", "tasty", "delicious", "enjoy", "favorite", "best", "smooth", "refreshing"];
const NEGATIVE = ["hate", "bad", "terrible", "awful", "dislike", "gross", "worst", "bland", "bitter", "sour", "stale", "disappointing", "nasty"];

function mockClassify(text: string): ParsedSentiment {
  const t = text.toLowerCase();
  const pos = POSITIVE.filter((w) => t.includes(w)).length;
  const neg = NEGATIVE.filter((w) => t.includes(w)).length;
  if (pos > neg) return { sentiment: "LIKE", confidence: 0.85 };
  if (neg > pos) return { sentiment: "DISLIKE", confidence: 0.85 };
  return { sentiment: "INDIFFERENT", confidence: 0.55 };
}

// ---------------- Main entry: run one SentimentBatch end to end ----------------

export async function runSentimentBatch(batchId: string): Promise<void> {
  const batchRows = await db.select().from(sentimentBatches).where(eq(sentimentBatches.id, batchId)).limit(1);
  const batch = batchRows[0];
  if (!batch) throw new Error(`SentimentBatch not found: ${batchId}`);

  // 1. Collect unanalyzed responses for the study (scoped to the upload when set)
  const rows = await db
    .select({ id: responses.id, feedbackText: responses.feedbackText })
    .from(responses)
    .where(
      batch.studyDataId
        ? eq(responses.studyDataId, batch.studyDataId)
        : eq(responses.studyId, batch.studyId)
    );
  const pending = rows.filter((r) => r.feedbackText.trim().length > 0);

  if (pending.length === 0) {
    await db.update(sentimentBatches).set({ status: "COMPLETED", completedAt: new Date() }).where(eq(sentimentBatches.id, batchId));
    return;
  }

  // Mock mode: classify locally, no external calls.
  if (env.sentimentMock) {
    await applyResults(new Map(pending.map((r) => [r.id, mockClassify(r.feedbackText)])), batchId);
    return;
  }

  if (!env.fireworksApiKey || !env.fireworksAccountId) {
    throw new Error("FIREWORKS_API_KEY and FIREWORKS_ACCOUNT_ID must be set (or SENTIMENT_MOCK=true)");
  }

  // 2. Build + upload dataset
  const lines = buildJsonlLines(pending);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cr-batch-"));
  const jsonlPath = path.join(tmpDir, `${batchId}.jsonl`);
  await fs.writeFile(jsonlPath, lines.join("\n") + "\n");

  const inputDatasetId = datasetIdForBatch(batchId);
  const outputDatasetId = `${inputDatasetId}-out`;
  const jobId = inputDatasetId;

  await db.update(sentimentBatches).set({
    status: "VALIDATING",
    requestCount: lines.length,
    inputDatasetId,
    outputDatasetId,
    fireworksJobId: jobId,
  }).where(eq(sentimentBatches.id, batchId));

  await createDatasetEntry(inputDatasetId);
  await uploadDatasetFile(inputDatasetId, jsonlPath);
  await fs.rm(tmpDir, { recursive: true, force: true });

  // 3. Create + poll job
  await createBatchJob(jobId, inputDatasetId, outputDatasetId);
  await db.update(sentimentBatches).set({ status: "PENDING" }).where(eq(sentimentBatches.id, batchId));

  const deadline = Date.now() + env.fireworksBatchExpiryHours * 3600_000;
  let state: BatchJobState = "PENDING";
  let statusMessage: string | undefined;
  while (Date.now() < deadline) {
    await sleep(env.fireworksPollIntervalMs);
    const s = await getBatchJob(jobId);
    state = s.state;
    statusMessage = s.statusMessage;
    if (state === "COMPLETED" || state === "FAILED" || state === "EXPIRED") break;
    await db.update(sentimentBatches).set({ status: state }).where(eq(sentimentBatches.id, batchId));
  }

  if (state === "FAILED") {
    await db.update(sentimentBatches).set({ status: "FAILED", error: statusMessage ?? "Batch job failed", completedAt: new Date() }).where(eq(sentimentBatches.id, batchId));
    return;
  }
  if (state === "EXPIRED" || (state !== "COMPLETED" && Date.now() >= deadline)) {
    // Completed rows are still saved in the output dataset; ingest what we have.
    await ingestOutput(outputDatasetId, batchId);
    await db.update(sentimentBatches).set({ status: "EXPIRED", error: "Job expired; partial results ingested", completedAt: new Date() }).where(eq(sentimentBatches.id, batchId));
    return;
  }

  // 4. Ingest results
  await ingestOutput(outputDatasetId, batchId);
  await db.update(sentimentBatches).set({ status: "COMPLETED", completedAt: new Date() }).where(eq(sentimentBatches.id, batchId));
}

async function ingestOutput(outputDatasetId: string, batchId: string): Promise<void> {
  const { results, errors } = await downloadOutputDataset(outputDatasetId);
  const parsed = parseResultsJsonl(results);
  for (const line of errors.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const obj = JSON.parse(t) as { custom_id?: string };
      if (obj.custom_id) parsed.set(obj.custom_id, { error: true });
    } catch {
      // skip
    }
  }
  await applyResults(parsed, batchId);
}

// Fan results out to all responses sharing identical feedback text (dedupe), skip manual overrides.
async function applyResults(
  parsed: Map<string, ParsedSentiment | { error: true }>,
  batchId: string
): Promise<void> {
  const batchRows = await db.select().from(sentimentBatches).where(eq(sentimentBatches.id, batchId)).limit(1);
  const batch = batchRows[0];
  if (!batch) return;

  const rows = await db
    .select()
    .from(responses)
    .where(
      batch.studyDataId
        ? eq(responses.studyDataId, batch.studyDataId)
        : eq(responses.studyId, batch.studyId)
    );

  const byId = new Map(rows.map((r) => [r.id, r]));

  // Map canonical (submitted) response ids to all responses with identical text.
  const textToResult = new Map<string, ParsedSentiment | { error: true }>();
  for (const [id, result] of parsed.entries()) {
    const r = byId.get(id);
    if (r) textToResult.set(r.feedbackText.trim().toLowerCase(), result);
  }

  let applied = 0;
  let flagged = 0;
  for (const r of rows) {
    if (r.sentimentOverridden) continue; // never clobber manual overrides
    if (r.sentiment) continue; // already analyzed
    const result = textToResult.get(r.feedbackText.trim().toLowerCase());
    if (!result) continue;
    if ("error" in result) {
      await db.update(responses).set({ flaggedForReview: true }).where(eq(responses.id, r.id));
      flagged++;
    } else {
      await db
        .update(responses)
        .set({
          sentiment: result.sentiment,
          sentimentScore: result.confidence,
          sentimentModel: env.sentimentMock ? "mock" : env.fireworksModel,
          flaggedForReview: result.confidence < 0.4,
          analyzedAt: new Date(),
        })
        .where(eq(responses.id, r.id));
      applied++;
    }
  }

  await db
    .update(sentimentBatches)
    .set({ error: flagged > 0 ? `${flagged} rows flagged for review` : null })
    .where(eq(sentimentBatches.id, batchId));

  console.log(`[sentiment] batch ${batchId}: applied=${applied} flagged=${flagged}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
