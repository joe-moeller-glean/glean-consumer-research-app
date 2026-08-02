/**
 * One-time generator for the demo seed fixtures.
 *
 *   npx tsx scripts/generate-seed-fixtures.ts
 *
 * Writes:
 *   src/db/seed/panelists.json          5,000 panelists across all tracked demographics
 *   src/db/seed/responses/<leg>.csv     one file per study leg, as a study export would arrive
 *
 * Those files are the seed data and are committed to the repo. The app and
 * src/db/seed/seed.ts read them; neither imports this script. Re-run it only to
 * regenerate the fixtures from scratch. Output is deterministic (fixed PRNG seed).
 */

import fs from "fs";
import path from "path";
import { CITIES, COUNTRIES, SEXES, RACES, INCOMES, FAMILIES } from "./seed-fixtures/demographics";
import { QUESTION_BANKS, type QuestionDef, type Sentiment } from "./seed-fixtures/questions";
import { STUDIES } from "../src/db/seed/studies";
import { sexEnum, raceEnum, incomeBandEnum, familyMakeupEnum } from "../src/db/schema";

const SEED_DIR = path.join(__dirname, "..", "src", "db", "seed");
const RESPONSES_DIR = path.join(SEED_DIR, "responses");
const PANELIST_COUNT = 5000;

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) so regenerating yields identical fixtures.
// ---------------------------------------------------------------------------
let state = 0x9e3779b9;
function rnd(): number {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}
function weighted<T extends { weight: number }>(arr: readonly T[]): T {
  const total = arr.reduce((s, x) => s + x.weight, 0);
  let r = rnd() * total;
  for (const item of arr) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return arr[arr.length - 1];
}
function int(min: number, max: number): number {
  return min + Math.floor(rnd() * (max - min + 1));
}

// ---------------------------------------------------------------------------
// Panelists
// ---------------------------------------------------------------------------

interface PanelistRecord {
  panelist_id: string;
  age: number | null;
  sex: string | null;
  race: string | null;
  country: string;
  state: string | null;
  city: string | null;
  household_income: string | null;
  family_makeup: string;
  household_size: number;
  children_count: number;
}

/** Skewed age draw so the panel is not uniform: peak in the 25-44 range. */
function drawAge(): number {
  const bucket = rnd();
  if (bucket < 0.08) return int(16, 17);
  if (bucket < 0.22) return int(18, 24);
  if (bucket < 0.47) return int(25, 34);
  if (bucket < 0.68) return int(35, 44);
  if (bucket < 0.82) return int(45, 54);
  if (bucket < 0.92) return int(55, 64);
  return int(65, 88);
}

function buildPanelists(): PanelistRecord[] {
  const out: PanelistRecord[] = [];
  for (let i = 0; i < PANELIST_COUNT; i++) {
    const family = weighted(FAMILIES).value;
    const hasKids = family === "SINGLE_WITH_KIDS" || family === "COUPLE_WITH_KIDS" || family === "MULTIGENERATIONAL";
    const children = hasKids ? int(1, 4) : rnd() < 0.03 ? 1 : 0;

    let householdSize: number;
    if (family === "SINGLE_NO_KIDS") householdSize = 1;
    else if (family === "COUPLE_NO_KIDS") householdSize = 2;
    else if (family === "ROOMMATES") householdSize = int(2, 4);
    else if (family === "MULTIGENERATIONAL") householdSize = int(3, 8);
    else householdSize = (family === "SINGLE_WITH_KIDS" ? 1 : 2) + children;

    const country = weighted(COUNTRIES).country;
    const isUs = country === "United States";
    const [city, state] = isUs ? pick(CITIES) : [null, null];

    // A realistic export has occasional gaps rather than perfect records.
    out.push({
      panelist_id: `NW-${String(100000 + i)}`,
      age: rnd() < 0.015 ? null : drawAge(),
      sex: rnd() < 0.02 ? null : weighted(SEXES).value,
      race: rnd() < 0.035 ? null : weighted(RACES).value,
      country,
      state,
      city,
      household_income: rnd() < 0.06 ? null : weighted(INCOMES).value,
      family_makeup: family,
      household_size: householdSize,
      children_count: children,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

/** Sentiment mix per intended study outcome. Must sum to 1. */
const MIX: Record<Sentiment, Record<Sentiment, number>> = {
  LIKE: { LIKE: 0.58, DISLIKE: 0.16, INDIFFERENT: 0.26 },
  DISLIKE: { LIKE: 0.17, DISLIKE: 0.56, INDIFFERENT: 0.27 },
  INDIFFERENT: { LIKE: 0.25, DISLIKE: 0.23, INDIFFERENT: 0.52 },
};

function drawSentiment(outcome: Sentiment, legTilt: number): Sentiment {
  // legTilt nudges individual legs so they differ from each other while the
  // study still lands on its intended overall outcome.
  const mix = MIX[outcome];
  const like = Math.max(0.02, mix.LIKE + legTilt);
  const dislike = Math.max(0.02, mix.DISLIKE - legTilt);
  const r = rnd() * (like + dislike + mix.INDIFFERENT);
  if (r < like) return "LIKE";
  if (r < like + dislike) return "DISLIKE";
  return "INDIFFERENT";
}

function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function answerFor(q: QuestionDef, sentiment: Sentiment): string {
  const pool = q.answers[sentiment];
  return pick(pool.length > 0 ? pool : q.answers.INDIFFERENT);
}

/** Fail fast if a pool value is not a member of the matching database enum. */
function assertPoolsMatchSchema(): void {
  const checks: [string, readonly string[], { value: string }[]][] = [
    ["sex", sexEnum.enumValues, SEXES],
    ["race", raceEnum.enumValues, RACES],
    ["household_income", incomeBandEnum.enumValues, INCOMES],
    ["family_makeup", familyMakeupEnum.enumValues, FAMILIES],
  ];
  for (const [name, allowed, pool] of checks) {
    for (const item of pool) {
      if (!allowed.includes(item.value)) {
        throw new Error(`${name} pool has "${item.value}", which is not in the ${name} enum: ${allowed.join(", ")}`);
      }
    }
    const missing = allowed.filter((v) => !pool.some((p) => p.value === v));
    if (missing.length > 0) {
      console.warn(`  note: ${name} enum values not represented in the panel: ${missing.join(", ")}`);
    }
  }
}

function main() {
  assertPoolsMatchSchema();
  fs.mkdirSync(RESPONSES_DIR, { recursive: true });

  const panelists = buildPanelists();
  fs.writeFileSync(path.join(SEED_DIR, "panelists.json"), JSON.stringify(panelists, null, 2) + "\n");
  console.log(`panelists.json: ${panelists.length} panelists`);

  const summary: string[] = [];

  for (const study of STUDIES) {
    const bank = QUESTION_BANKS[study.slug];
    if (!bank) throw new Error(`No question bank for study ${study.slug}`);

    // 500-1000 responses per study, split across its legs.
    const studyTarget = int(540, 960);
    const perLeg = Math.floor(studyTarget / study.legs.length);

    // Each study draws from a random slice of the panel, so participation varies.
    const poolStart = int(0, panelists.length - 1200);
    const pool = panelists.slice(poolStart, poolStart + 1100);

    let studyRows = 0;
    const tally: Record<Sentiment, number> = { LIKE: 0, DISLIKE: 0, INDIFFERENT: 0 };

    study.legs.forEach((leg, legIndex) => {
      const tilt = study.legs.length === 1 ? 0 : (legIndex - (study.legs.length - 1) / 2) * 0.09;

      // Expected answers per panelist, accounting for per-question skip rates,
      // so the leg lands near its row target instead of overshooting.
      const answersPerPanelist = bank.reduce((sum, q) => sum + (1 - (q.skipRate ?? 0)), 0);
      const participants = Math.max(40, Math.round(perLeg / Math.max(1, answersPerPanelist)));

      const lines: string[] = ["panelist_id,question,feedback,coded_sentiment,responded_at"];
      let legRows = 0;

      for (let i = 0; i < participants; i++) {
        const panelist = pool[(i * 7 + legIndex * 13) % pool.length];
        // One panelist has a consistent overall view across the questions they answer.
        const base = drawSentiment(study.expectedOutcome, tilt);
        const day = int(1, 24);
        const respondedAt = `2026-0${legIndex + 3}-${String(day).padStart(2, "0")}`;

        for (const q of bank) {
          if (rnd() < (q.skipRate ?? 0)) continue;
          // Mostly consistent with their overall view, occasionally not.
          const sentiment: Sentiment = rnd() < 0.82 ? base : drawSentiment(study.expectedOutcome, tilt);
          const text = answerFor(q, sentiment);
          lines.push(
            [panelist.panelist_id, q.text, text, sentiment, respondedAt].map(csvEscape).join(",")
          );
          tally[sentiment]++;
          legRows++;
          studyRows++;
        }
      }

      fs.writeFileSync(path.join(RESPONSES_DIR, leg.file), lines.join("\n") + "\n");
      console.log(`  ${leg.file}: ${legRows} responses`);
    });

    const dominant = (Object.keys(tally) as Sentiment[]).reduce((a, b) => (tally[a] >= tally[b] ? a : b));
    const pct = (s: Sentiment) => Math.round((tally[s] / studyRows) * 100);
    const ok = dominant === study.expectedOutcome ? "OK" : "MISMATCH";
    summary.push(
      `${ok}  ${study.slug}: ${studyRows} responses, ` +
        `Like ${pct("LIKE")}% / Dislike ${pct("DISLIKE")}% / Indifferent ${pct("INDIFFERENT")}% ` +
        `-> ${dominant} (expected ${study.expectedOutcome})`
    );
  }

  console.log("\n--- summary ---");
  summary.forEach((s) => console.log(s));
  if (summary.some((s) => s.startsWith("MISMATCH"))) {
    console.error("\nAt least one study did not land on its expected outcome.");
    process.exit(1);
  }
}

main();
