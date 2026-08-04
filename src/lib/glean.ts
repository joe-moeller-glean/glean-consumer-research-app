import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { studyAnalyses } from "@/db/schema";
import { env, gleanConfigured } from "@/lib/env";
import { buildGleanPayload } from "@/lib/aggregate";

/**
 * Glean hosted-agent integration for the written overall analysis.
 *
 * The agent is created once in Glean (agent builder) with instructions to turn a
 * JSON sentiment breakdown into an executive consumer-research analysis. This app
 * only sends aggregates: counts and percentages, never verbatims or panelist PII.
 */

const ANALYSIS_INSTRUCTIONS = `Analyze this consumer research sentiment dataset and write an executive analysis with these sections:
1. Headline findings
2. Demographic divergence - which segments over- or under-index on Like vs Dislike relative to the overall rate
3. Risks and watch-outs
4. Recommendations for the product team

Be specific and cite percentages from the data. Keep it under 600 words.`;

/** Call the hosted Glean agent and return its written analysis. */
/** Build an absolute Glean API URL from the configured backend host. */
export function gleanApiUrl(pathname: string): string {
  if (!env.gleanBeUrl) {
    throw new Error(
      "GLEAN_BE_URL is not set. Set it to your Glean backend host, e.g. https://<instance>-be.glean.com"
    );
  }
  return `${env.gleanBeUrl}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

async function callGleanAgent(payload: Record<string, unknown>): Promise<string> {
  const message = `${ANALYSIS_INSTRUCTIONS}\n\nDATA (JSON):\n${JSON.stringify(payload, null, 2)}`;

  // All Glean API requests go to the instance backend host (serverURL in the
  // Glean developer docs), never a shared api.glean.com domain.
  const res = await fetch(gleanApiUrl("/rest/api/v1/agents/runs/wait"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.gleanApiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agent_id: env.gleanAgentId,
      input: { message },
    }),
  });

  if (!res.ok) {
    throw new Error(`Glean agent run failed (${res.status}): ${(await res.text()).slice(0, 500)}`);
  }

  const json = (await res.json()) as {
    output?: string;
    result?: string;
    messages?: Array<{ content?: string | Array<{ text?: string }> }>;
  };

  // Accept the common response shapes rather than assuming exactly one.
  if (typeof json.output === "string" && json.output.trim()) return json.output;
  if (typeof json.result === "string" && json.result.trim()) return json.result;

  const fromMessages = (json.messages ?? [])
    .map((m) =>
      typeof m.content === "string" ? m.content : (m.content ?? []).map((c) => c.text ?? "").join("")
    )
    .filter(Boolean)
    .join("\n\n");

  if (!fromMessages.trim()) throw new Error("Glean agent returned an empty response");
  return fromMessages;
}

/** Deterministic stand-in so the app is demoable before Glean is wired up. */
function mockAnalysis(payload: Record<string, unknown>): string {
  const study = (payload.study ?? {}) as { name?: string; product?: string; productVersion?: string };
  const overall = (payload.overallSentiment ?? {}) as {
    total?: number;
    likePct?: number;
    dislikePct?: number;
    indifferentPct?: number;
  };
  const demographics = (payload.sentimentByDemographic ?? {}) as Record<
    string,
    Array<{ label: string; likePct: number; total: number }>
  >;

  // Surface the segments that diverge most from the overall Like rate.
  const baseline = overall.likePct ?? 0;
  const notable = Object.entries(demographics)
    .flatMap(([dimension, rows]) =>
      (rows ?? [])
        .filter((r) => r.total >= 3)
        .map((r) => ({ dimension, label: r.label, delta: Math.round((r.likePct - baseline) * 10) / 10 }))
    )
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 5);

  return [
    `## Overall analysis: ${study.name ?? "Study"}`,
    "",
    `**Product:** ${study.product ?? "-"} (${study.productVersion ?? "-"})`,
    "",
    "### Headline findings",
    `Across ${overall.total ?? 0} analyzed responses: **${overall.likePct ?? 0}% Like**, ` +
      `**${overall.dislikePct ?? 0}% Dislike**, **${overall.indifferentPct ?? 0}% Indifferent**.`,
    "",
    "### Demographic divergence",
    notable.length > 0
      ? notable
          .map(
            (n) =>
              `- **${n.label}** (${n.dimension}): ${n.delta >= 0 ? "+" : ""}${n.delta} pts vs the ${baseline}% overall Like rate`
          )
          .join("\n")
      : "- Not enough data per segment to identify divergence.",
    "",
    "### Risks and watch-outs",
    "- This is offline placeholder text. Set GLEAN_API_TOKEN and GLEAN_AGENT_ID to generate a real Glean analysis.",
    "",
    "### Recommendations",
    `- Investigate segments where Dislike exceeds the overall ${overall.dislikePct ?? 0}% rate.`,
  ].join("\n");
}

/**
 * Run one StudyAnalysis record to completion. Called by the worker so a slow
 * agent response never blocks an HTTP request.
 */
export async function runGleanAnalysis(analysisId: string): Promise<void> {
  const rows = await db.select().from(studyAnalyses).where(eq(studyAnalyses.id, analysisId)).limit(1);
  const analysis = rows[0];
  if (!analysis) throw new Error(`StudyAnalysis not found: ${analysisId}`);

  await db.update(studyAnalyses).set({ status: "RUNNING" }).where(eq(studyAnalyses.id, analysisId));

  try {
    const payload =
      (analysis.inputJson as Record<string, unknown> | null) ??
      (await buildGleanPayload(analysis.studyId));

    const useRealAgent = gleanConfigured();
    const output = useRealAgent ? await callGleanAgent(payload) : mockAnalysis(payload);

    await db
      .update(studyAnalyses)
      .set({
        status: "COMPLETE",
        inputJson: payload,
        outputText: output,
        model: useRealAgent ? `glean-agent:${env.gleanAgentId}` : "mock",
        completedAt: new Date(),
      })
      .where(eq(studyAnalyses.id, analysisId));
  } catch (e) {
    await db
      .update(studyAnalyses)
      .set({ status: "FAILED", error: (e as Error).message, completedAt: new Date() })
      .where(eq(studyAnalyses.id, analysisId));
    throw e;
  }
}

export async function latestAnalysis(studyId: string) {
  const rows = await db
    .select()
    .from(studyAnalyses)
    .where(eq(studyAnalyses.studyId, studyId))
    .orderBy(desc(studyAnalyses.createdAt))
    .limit(1);
  return rows[0] ?? null;
}
