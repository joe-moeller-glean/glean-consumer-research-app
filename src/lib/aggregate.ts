import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { responses, panelists, studies, legs, studyAnalyses } from "@/db/schema";
import { env } from "@/lib/env";
import { ageBand, bandOrder } from "@/lib/demographics";
import {
  SEX_LABELS,
  RACE_LABELS,
  INCOME_LABELS,
  FAMILY_MAKEUP_LABELS,
} from "@/lib/labels";

/**
 * Demographic aggregation: overall + per-dimension sentiment breakdown.
 * Computed from live Response/Panelist rows (never from raw files) so
 * demographic edits take effect immediately.
 */

export type SentimentCounts = { LIKE: number; DISLIKE: number; INDIFFERENT: number };

export type BreakdownRow = SentimentCounts & {
  bucket: string; // raw enum/band value
  label: string; // display label
  total: number;
  likePct: number;
  dislikePct: number;
  indifferentPct: number;
};

export type RegionRow = SentimentCounts & { country: string; state: string | null; city: string | null; total: number };

export type StudySummary = {
  studyId: string;
  totalResponses: number;
  analyzedResponses: number;
  overall: SentimentCounts & { total: number; likePct: number; dislikePct: number; indifferentPct: number };
  byLeg: Array<{ legId: string; legName: string; sequence: number } & SentimentCounts & { total: number }>;
  demographics: {
    age: BreakdownRow[];
    sex: BreakdownRow[];
    race: BreakdownRow[];
    income: BreakdownRow[];
    familyMakeup: BreakdownRow[];
    householdSize: BreakdownRow[];
    children: BreakdownRow[];
  };
  regions: {
    countries: RegionRow[];
    states: RegionRow[];
    cities: RegionRow[];
  };
};

const EMPTY: SentimentCounts = { LIKE: 0, DISLIKE: 0, INDIFFERENT: 0 };

function add(c: SentimentCounts, s: string | null): void {
  if (s === "LIKE") c.LIKE++;
  else if (s === "DISLIKE") c.DISLIKE++;
  else if (s === "INDIFFERENT") c.INDIFFERENT++;
}

function toRow(bucket: string, label: string, c: SentimentCounts): BreakdownRow {
  const total = c.LIKE + c.DISLIKE + c.INDIFFERENT;
  return {
    bucket,
    label,
    ...c,
    total,
    likePct: pct(c.LIKE, total),
    dislikePct: pct(c.DISLIKE, total),
    indifferentPct: pct(c.INDIFFERENT, total),
  };
}

function pct(n: number, total: number): number {
  return total === 0 ? 0 : Math.round((n / total) * 1000) / 10;
}

function householdSizeBucket(n: number | null | undefined): string {
  if (n === null || n === undefined) return "Unknown";
  if (n === 1) return "1 person";
  if (n === 2) return "2 people";
  if (n === 3) return "3 people";
  if (n === 4) return "4 people";
  return "5+ people";
}

function childrenBucket(n: number | null | undefined): string {
  if (n === null || n === undefined) return "Unknown";
  if (n === 0) return "No children";
  if (n === 1) return "1 child";
  if (n === 2) return "2 children";
  return "3+ children";
}

export async function aggregateStudy(studyId: string): Promise<StudySummary> {
  const rows = await db
    .select({
      sentiment: responses.sentiment,
      legId: responses.legId,
      panelist: {
        age: panelists.age,
        sex: panelists.sex,
        race: panelists.race,
        country: panelists.country,
        state: panelists.state,
        city: panelists.city,
        householdIncome: panelists.householdIncome,
        familyMakeup: panelists.familyMakeup,
        householdSize: panelists.householdSize,
        childrenCount: panelists.childrenCount,
      },
    })
    .from(responses)
    .leftJoin(panelists, eq(responses.panelistId, panelists.id))
    .where(eq(responses.studyId, studyId));

  const studyLegs = await db
    .select()
    .from(legs)
    .where(eq(legs.studyId, studyId))
    .orderBy(legs.sequence);

  const overall = { ...EMPTY };
  const age = new Map<string, SentimentCounts>();
  const sex = new Map<string, SentimentCounts>();
  const race = new Map<string, SentimentCounts>();
  const income = new Map<string, SentimentCounts>();
  const family = new Map<string, SentimentCounts>();
  const hhSize = new Map<string, SentimentCounts>();
  const children = new Map<string, SentimentCounts>();
  const countries = new Map<string, SentimentCounts>();
  const states = new Map<string, SentimentCounts>();
  const cities = new Map<string, SentimentCounts>();
  const byLeg = new Map<string, SentimentCounts>();

  const bump = (map: Map<string, SentimentCounts>, key: string, s: string | null) => {
    if (!map.has(key)) map.set(key, { ...EMPTY });
    add(map.get(key)!, s);
  };

  let analyzed = 0;
  for (const r of rows) {
    const s = r.sentiment;
    if (!s) continue;
    analyzed++;
    add(overall, s);
    bump(byLeg, r.legId, s);
    bump(age, ageBand(r.panelist?.age), s);
    bump(sex, r.panelist?.sex ?? "Unknown", s);
    bump(race, r.panelist?.race ?? "Unknown", s);
    bump(income, r.panelist?.householdIncome ?? "Unknown", s);
    bump(family, r.panelist?.familyMakeup ?? "Unknown", s);
    bump(hhSize, householdSizeBucket(r.panelist?.householdSize), s);
    bump(children, childrenBucket(r.panelist?.childrenCount), s);
    if (r.panelist?.country) bump(countries, r.panelist.country, s);
    if (r.panelist?.state) bump(states, r.panelist.state, s);
    if (r.panelist?.city) bump(cities, r.panelist.city, s);
  }

  const orderMap = (map: Map<string, SentimentCounts>, dimension: string, labels: Record<string, string>): BreakdownRow[] => {
    const order = bandOrder(dimension);
    const entries = [...map.entries()];
    entries.sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
    return entries.map(([k, c]) => toRow(k, labels[k] ?? k, c));
  };

  const sortByTotal = (map: Map<string, SentimentCounts>, key: "country" | "state" | "city"): RegionRow[] =>
    [...map.entries()]
      .map(([k, c]) => ({
        country: key === "country" ? k : "",
        state: key === "state" ? k : null,
        city: key === "city" ? k : null,
        ...c,
        total: c.LIKE + c.DISLIKE + c.INDIFFERENT,
      }))
      .sort((a, b) => b.total - a.total);

  const overallTotal = overall.LIKE + overall.DISLIKE + overall.INDIFFERENT;

  return {
    studyId,
    totalResponses: rows.length,
    analyzedResponses: analyzed,
    overall: {
      ...overall,
      total: overallTotal,
      likePct: pct(overall.LIKE, overallTotal),
      dislikePct: pct(overall.DISLIKE, overallTotal),
      indifferentPct: pct(overall.INDIFFERENT, overallTotal),
    },
    byLeg: studyLegs.map((l) => {
      const c = byLeg.get(l.id) ?? { ...EMPTY };
      return { legId: l.id, legName: l.name, sequence: l.sequence, ...c, total: c.LIKE + c.DISLIKE + c.INDIFFERENT };
    }),
    demographics: {
      age: orderMap(age, "age", {}),
      sex: orderMap(sex, "sex", SEX_LABELS),
      race: orderMap(race, "race", RACE_LABELS),
      income: orderMap(income, "income", INCOME_LABELS),
      familyMakeup: orderMap(family, "familyMakeup", FAMILY_MAKEUP_LABELS),
      householdSize: orderMap(hhSize, "householdSize", {}),
      children: orderMap(children, "children", {}),
    },
    regions: {
      countries: sortByTotal(countries, "country"),
      states: sortByTotal(states, "state"),
      cities: sortByTotal(cities, "city"),
    },
  };
}

/**
 * Build the aggregates-only payload sent to the Glean agent.
 * IMPORTANT: contains counts/percentages only — no verbatims, no PII.
 */
export async function buildGleanPayload(studyId: string): Promise<Record<string, unknown>> {
  const studyRows = await db.select().from(studies).where(eq(studies.id, studyId)).limit(1);
  const study = studyRows[0];
  if (!study) throw new Error("Study not found");
  const summary = await aggregateStudy(studyId);
  return {
    study: {
      name: study.name,
      product: study.product,
      productVersion: study.productVersion,
      testCriteria: study.testCriteria,
      category: study.category,
    },
    responses: { total: summary.totalResponses, analyzed: summary.analyzedResponses },
    overallSentiment: summary.overall,
    sentimentByLeg: summary.byLeg,
    sentimentByDemographic: summary.demographics,
    sentimentByRegion: {
      topCountries: summary.regions.countries.slice(0, 20),
      topStates: summary.regions.states.slice(0, 20),
      topCities: summary.regions.cities.slice(0, 20),
    },
    note: "Sentiment classes: LIKE, DISLIKE, INDIFFERENT. All figures are counts and percentages of analyzed consumer feedback rows.",
  };
}

// ---------------- Glean agent call ----------------

export async function runGleanAnalysis(analysisId: string): Promise<void> {
  const rows = await db.select().from(studyAnalyses).where(eq(studyAnalyses.id, analysisId)).limit(1);
  const analysis = rows[0];
  if (!analysis) throw new Error(`StudyAnalysis not found: ${analysisId}`);

  await db.update(studyAnalyses).set({ status: "RUNNING" }).where(eq(studyAnalyses.id, analysisId));

  try {
    const payload: Record<string, unknown> =
      (analysis.inputJson as Record<string, unknown> | null) ?? (await buildGleanPayload(analysis.studyId));
    let output: string;

    if (env.gleanMock || !env.gleanApiToken || !env.gleanAgentId) {
      output = mockAnalysis(payload as Parameters<typeof mockAnalysis>[0]);
    } else {
      output = await callGleanAgent(payload);
    }

    await db
      .update(studyAnalyses)
      .set({
        status: "COMPLETE",
        inputJson: payload,
        outputText: output,
        model: env.gleanMock ? "mock" : env.gleanAgentId,
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

async function callGleanAgent(payload: Record<string, unknown>): Promise<string> {
  // Hosted agent invocation via the Glean agent runtime REST API.
  // The agent is created once in the Glean admin console / agent builder with
  // instructions to write a consumer-research analysis from a JSON sentiment breakdown.
  const message = `Analyze this consumer research sentiment dataset and write an executive analysis with: (1) headline findings, (2) demographic divergence (which segments over/under-index on Like vs Dislike), (3) risks and watch-outs, (4) recommendations for the product team.\n\nDATA (JSON):\n${JSON.stringify(payload, null, 2)}`;

  const res = await fetch(`${env.gleanBaseUrl}/rest/api/v1/agents/runs/wait`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.gleanApiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agent_id: env.gleanAgentId,
      inputs: { message },
    }),
  });

  if (!res.ok) {
    throw new Error(`Glean agent call failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { output?: string; result?: string; messages?: Array<{ content?: string }> };
  const text = json.output ?? json.result ?? json.messages?.map((m) => m.content ?? "").join("\n");
  if (!text) throw new Error("Glean agent returned no output");
  return text;
}

function mockAnalysis(payload: {
  study?: { name?: string; product?: string; productVersion?: string };
  overallSentiment?: { LIKE?: number; DISLIKE?: number; INDIFFERENT?: number; total?: number; likePct?: number; dislikePct?: number };
}): string {
  const o = payload.overallSentiment ?? {};
  return [
    `## Overall Analysis — ${payload.study?.name ?? "Study"}`,
    "",
    `**Product:** ${payload.study?.product ?? "—"} (${payload.study?.productVersion ?? "—"})`,
    "",
    `### Headline findings`,
    `Across ${o.total ?? 0} analyzed responses, **${o.likePct ?? 0}% Like**, **${o.dislikePct ?? 0}% Dislike**, remainder Indifferent.`,
    "",
    `### Demographic divergence`,
    `(Mock output — configure GLEAN_API_TOKEN and GLEAN_AGENT_ID to generate a real analysis.)`,
    "",
    `### Recommendations`,
    `- Review demographic breakdown charts for segments where Dislike exceeds the overall ${o.dislikePct ?? 0}%.`,
  ].join("\n");
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
