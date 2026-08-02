import { z } from "zod";

const emptyToNull = (v: unknown) =>
  v === "" || v === undefined ? null : typeof v === "string" ? v.trim() || null : v;

const nullableInt = z.preprocess(
  (v) => (emptyToNull(v) === null ? null : Number(v)),
  z.number().int().nullable().optional()
);

const nullableString = z.preprocess(emptyToNull, z.string().nullable().optional());

// Maps a parsed CSV row (headers normalized to lowercase_snake) to a Response insert.
// Expected columns: panelist_id (required), feedback (required), question (optional).
// Recognized demographic columns are used to enrich stub panelists.
export const csvRowSchema = z.object({
  panelist_id: z.string().min(1),
  feedback: z.string().min(1),
  question: nullableString,
  age: nullableInt,
  sex: nullableString,
  race: nullableString,
  country: nullableString,
  state: nullableString,
  city: nullableString,
  household_income: nullableString,
  family_makeup: nullableString,
  household_size: nullableInt,
  children_count: nullableInt,
});

export type CsvRow = z.infer<typeof csvRowSchema>;

export const RESERVED_COLUMNS = new Set(Object.keys(csvRowSchema.shape));

// Normalize a CSV header: "Panelist ID" -> "panelist_id", "Household Income" -> "household_income"
export function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeRecord(record: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(record)) out[normalizeHeader(k)] = v;
  return out;
}

// Accept a few common aliases for required columns.
const ALIASES: Record<string, string[]> = {
  panelist_id: ["panelist", "panelistid", "participant_id", "participant", "respondent_id", "respondent"],
  feedback: ["feedback_text", "response", "comment", "comments", "verbatim", "answer", "text"],
  question: ["question_text", "prompt", "survey_question"],
};

export function applyAliases(rec: Record<string, string>): Record<string, string> {
  const out = { ...rec };
  for (const [canonical, aliases] of Object.entries(ALIASES)) {
    if (out[canonical] === undefined) {
      for (const a of aliases) {
        if (out[a] !== undefined) {
          out[canonical] = out[a];
          delete out[a];
          break;
        }
      }
    }
  }
  return out;
}
