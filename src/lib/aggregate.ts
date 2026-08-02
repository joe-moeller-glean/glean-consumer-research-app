import { eq } from "drizzle-orm";
import { db } from "@/db";
import { responses, panelists, studies, legs } from "@/db/schema";
import { ageBand, bandOrder } from "@/lib/demographics";
import { SEX_LABELS, RACE_LABELS, INCOME_LABELS, FAMILY_MAKEUP_LABELS } from "@/lib/labels";

/**
 * Demographic aggregation.
 *
 * summarize() is pure so it can be unit tested without a database; aggregateStudy()
 * is the thin DB wrapper. Buckets are derived at read time, so editing a panelist's
 * demographics is reflected immediately without reprocessing any files.
 */

export type SentimentCounts = { LIKE: number; DISLIKE: number; INDIFFERENT: number };

export type BreakdownRow = SentimentCounts & {
  bucket: string;
  label: string;
  total: number;
  likePct: number;
  dislikePct: number;
  indifferentPct: number;
};

export type OverallSummary = SentimentCounts & {
  total: number;
  likePct: number;
  dislikePct: number;
  indifferentPct: number;
};

export type LegSummary = SentimentCounts & {
  legId: string;
  legName: string;
  sequence: number;
  total: number;
};

export type StudySummary = {
  studyId: string;
  totalResponses: number;
  analyzedResponses: number;
  overall: OverallSummary;
  byLeg: LegSummary[];
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
    country: BreakdownRow[];
    state: BreakdownRow[];
    city: BreakdownRow[];
  };
};

/** One response row plus its panelist's demographics, as needed for bucketing. */
export type AggregateInputRow = {
  sentiment: string | null;
  legId: string;
  age: number | null;
  sex: string | null;
  race: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  householdIncome: string | null;
  familyMakeup: string | null;
  householdSize: number | null;
  childrenCount: number | null;
};

export const UNKNOWN = "Unknown";

function pct(n: number, total: number): number {
  return total === 0 ? 0 : Math.round((n / total) * 1000) / 10;
}

function emptyCounts(): SentimentCounts {
  return { LIKE: 0, DISLIKE: 0, INDIFFERENT: 0 };
}

function addTo(counts: SentimentCounts, sentiment: string): void {
  if (sentiment === "LIKE") counts.LIKE++;
  else if (sentiment === "DISLIKE") counts.DISLIKE++;
  else if (sentiment === "INDIFFERENT") counts.INDIFFERENT++;
}

function toRow(bucket: string, label: string, counts: SentimentCounts): BreakdownRow {
  const total = counts.LIKE + counts.DISLIKE + counts.INDIFFERENT;
  return {
    bucket,
    label,
    ...counts,
    total,
    likePct: pct(counts.LIKE, total),
    dislikePct: pct(counts.DISLIKE, total),
    indifferentPct: pct(counts.INDIFFERENT, total),
  };
}

export function householdSizeBucket(n: number | null): string {
  if (n === null) return UNKNOWN;
  if (n <= 1) return "1 person";
  if (n >= 5) return "5+ people";
  return `${n} people`;
}

export function childrenBucket(n: number | null): string {
  if (n === null) return UNKNOWN;
  if (n === 0) return "No children";
  if (n === 1) return "1 child";
  if (n >= 3) return "3+ children";
  return "2 children";
}

class Buckets {
  private map = new Map<string, SentimentCounts>();

  add(key: string, sentiment: string): void {
    let counts = this.map.get(key);
    if (!counts) {
      counts = emptyCounts();
      this.map.set(key, counts);
    }
    addTo(counts, sentiment);
  }

  /** Ordered by the canonical band order when known, else by descending volume. */
  rows(dimension: string, labels: Record<string, string> = {}): BreakdownRow[] {
    const order = bandOrder(dimension);
    const entries = [...this.map.entries()];
    if (order.length > 0) {
      entries.sort((a, b) => {
        const ia = order.indexOf(a[0]);
        const ib = order.indexOf(b[0]);
        return (ia === -1 ? Number.MAX_SAFE_INTEGER : ia) - (ib === -1 ? Number.MAX_SAFE_INTEGER : ib);
      });
    } else {
      entries.sort(
        (a, b) =>
          b[1].LIKE + b[1].DISLIKE + b[1].INDIFFERENT - (a[1].LIKE + a[1].DISLIKE + a[1].INDIFFERENT)
      );
    }
    return entries.map(([bucket, counts]) => toRow(bucket, labels[bucket] ?? bucket, counts));
  }
}

/**
 * Pure aggregation over already-analyzed rows. Rows without a sentiment are
 * counted in totalResponses but excluded from every breakdown.
 */
export function summarize(
  studyId: string,
  rows: AggregateInputRow[],
  studyLegs: Array<{ id: string; name: string; sequence: number }>
): StudySummary {
  const overall = emptyCounts();
  const age = new Buckets();
  const sex = new Buckets();
  const race = new Buckets();
  const income = new Buckets();
  const family = new Buckets();
  const hhSize = new Buckets();
  const children = new Buckets();
  const country = new Buckets();
  const state = new Buckets();
  const city = new Buckets();
  const legCounts = new Map<string, SentimentCounts>();

  let analyzed = 0;
  for (const row of rows) {
    const s = row.sentiment;
    if (!s) continue;
    analyzed++;
    addTo(overall, s);

    let legBucket = legCounts.get(row.legId);
    if (!legBucket) {
      legBucket = emptyCounts();
      legCounts.set(row.legId, legBucket);
    }
    addTo(legBucket, s);

    age.add(ageBand(row.age), s);
    sex.add(row.sex ?? UNKNOWN, s);
    race.add(row.race ?? UNKNOWN, s);
    income.add(row.householdIncome ?? UNKNOWN, s);
    family.add(row.familyMakeup ?? UNKNOWN, s);
    hhSize.add(householdSizeBucket(row.householdSize), s);
    children.add(childrenBucket(row.childrenCount), s);
    if (row.country) country.add(row.country, s);
    if (row.state) state.add(row.state, s);
    if (row.city) city.add(row.city, s);
  }

  const total = overall.LIKE + overall.DISLIKE + overall.INDIFFERENT;

  return {
    studyId,
    totalResponses: rows.length,
    analyzedResponses: analyzed,
    overall: {
      ...overall,
      total,
      likePct: pct(overall.LIKE, total),
      dislikePct: pct(overall.DISLIKE, total),
      indifferentPct: pct(overall.INDIFFERENT, total),
    },
    byLeg: studyLegs.map((leg) => {
      const counts = legCounts.get(leg.id) ?? emptyCounts();
      return {
        legId: leg.id,
        legName: leg.name,
        sequence: leg.sequence,
        ...counts,
        total: counts.LIKE + counts.DISLIKE + counts.INDIFFERENT,
      };
    }),
    demographics: {
      age: age.rows("age"),
      sex: sex.rows("sex", SEX_LABELS),
      race: race.rows("race", RACE_LABELS),
      income: income.rows("income", INCOME_LABELS),
      familyMakeup: family.rows("familyMakeup", FAMILY_MAKEUP_LABELS),
      householdSize: hhSize.rows("householdSize"),
      children: children.rows("children"),
    },
    regions: {
      country: country.rows("country"),
      state: state.rows("state"),
      city: city.rows("city"),
    },
  };
}

/** Load a study's responses + panelist demographics and summarize them. */
export async function aggregateStudy(studyId: string): Promise<StudySummary> {
  const rows = await db
    .select({
      sentiment: responses.sentiment,
      legId: responses.legId,
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
    })
    .from(responses)
    .leftJoin(panelists, eq(responses.panelistId, panelists.id))
    .where(eq(responses.studyId, studyId));

  const studyLegs = await db
    .select({ id: legs.id, name: legs.name, sequence: legs.sequence })
    .from(legs)
    .where(eq(legs.studyId, studyId))
    .orderBy(legs.sequence);

  return summarize(studyId, rows, studyLegs);
}

/**
 * Aggregates-only payload for the Glean agent.
 * Contains counts and percentages only: no verbatims, no panelist identifiers,
 * no PII ever leaves the database for the written analysis.
 */
export async function buildGleanPayload(studyId: string): Promise<Record<string, unknown>> {
  const studyRows = await db.select().from(studies).where(eq(studies.id, studyId)).limit(1);
  const study = studyRows[0];
  if (!study) throw new Error(`Study not found: ${studyId}`);

  const summary = await aggregateStudy(studyId);

  return {
    study: {
      name: study.name,
      product: study.product,
      productVersion: study.productVersion,
      testCriteria: study.testCriteria,
      category: study.category,
    },
    responseCounts: { total: summary.totalResponses, analyzed: summary.analyzedResponses },
    overallSentiment: summary.overall,
    sentimentByLeg: summary.byLeg,
    sentimentByDemographic: summary.demographics,
    sentimentByRegion: {
      topCountries: summary.regions.country.slice(0, 20),
      topStates: summary.regions.state.slice(0, 20),
      topCities: summary.regions.city.slice(0, 20),
    },
    notes:
      "Sentiment classes are LIKE, DISLIKE, INDIFFERENT. Figures are counts and percentages of analyzed consumer feedback rows.",
  };
}
