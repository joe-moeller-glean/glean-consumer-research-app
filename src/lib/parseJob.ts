import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { studyData, responses, panelists, studyPanelists, legPanelists, studies } from "@/db/schema";
import { readFile } from "@/lib/storage";
import { normalizeRecord, applyAliases, csvRowSchema, RESERVED_COLUMNS, type CsvRow } from "@/lib/csv";
import { env } from "@/lib/env";

/**
 * Parse job: read an uploaded StudyData file (CSV, or ZIP containing CSVs),
 * insert Response rows, link panelists, and mark the file PARSED.
 * Demographic columns in the CSV are used to populate auto-created panelists.
 */

const INSERT_CHUNK = 500;

type CsvFile = { name: string; content: string };

async function extractCsvFiles(storagePath: string, fileType: string): Promise<CsvFile[]> {
  const buf = await readFile(storagePath);
  if (fileType !== "ZIP") {
    return [{ name: storagePath, content: buf.toString("utf8") }];
  }

  const entries = new AdmZip(buf)
    .getEntries()
    .filter((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith(".csv"));

  if (entries.length === 0) throw new Error("ZIP contains no .csv files");
  if (entries.length > env.maxZipEntries) {
    throw new Error(`ZIP contains ${entries.length} CSVs, which exceeds the limit of ${env.maxZipEntries}`);
  }

  return entries.map((e) => ({ name: e.entryName, content: e.getData().toString("utf8") }));
}

// CSV demographic values are free text; map the common spellings onto our enums.
const SEX_MAP: Record<string, "MALE" | "FEMALE" | "NONBINARY" | "OTHER" | "PREFER_NOT_TO_SAY"> = {
  male: "MALE", m: "MALE", man: "MALE",
  female: "FEMALE", f: "FEMALE", woman: "FEMALE",
  nonbinary: "NONBINARY", non_binary: "NONBINARY", nb: "NONBINARY",
  other: "OTHER",
  prefer_not_to_say: "PREFER_NOT_TO_SAY", declined: "PREFER_NOT_TO_SAY",
};

const RACE_MAP: Record<string, "AMERICAN_INDIAN_ALASKA_NATIVE" | "ASIAN" | "BLACK_AFRICAN_AMERICAN" | "NATIVE_HAWAIIAN_PACIFIC_ISLANDER" | "WHITE" | "MULTIRACIAL" | "OTHER" | "PREFER_NOT_TO_SAY"> = {
  asian: "ASIAN",
  black: "BLACK_AFRICAN_AMERICAN", black_african_american: "BLACK_AFRICAN_AMERICAN", african_american: "BLACK_AFRICAN_AMERICAN",
  white: "WHITE", caucasian: "WHITE",
  multiracial: "MULTIRACIAL", mixed: "MULTIRACIAL", two_or_more_races: "MULTIRACIAL",
  american_indian: "AMERICAN_INDIAN_ALASKA_NATIVE", american_indian_alaska_native: "AMERICAN_INDIAN_ALASKA_NATIVE", native_american: "AMERICAN_INDIAN_ALASKA_NATIVE",
  native_hawaiian: "NATIVE_HAWAIIAN_PACIFIC_ISLANDER", native_hawaiian_pacific_islander: "NATIVE_HAWAIIAN_PACIFIC_ISLANDER", pacific_islander: "NATIVE_HAWAIIAN_PACIFIC_ISLANDER",
  other: "OTHER", hispanic: "OTHER", latino: "OTHER", latinx: "OTHER",
  prefer_not_to_say: "PREFER_NOT_TO_SAY",
};

const INCOME_MAP: Record<string, "UNDER_25K" | "K25_50K" | "K50_75K" | "K75_100K" | "K100_150K" | "K150_200K" | "OVER_200K" | "PREFER_NOT_TO_SAY"> = {
  under_25k: "UNDER_25K", "0_25k": "UNDER_25K",
  "25k_50k": "K25_50K", "25_50k": "K25_50K",
  "50k_75k": "K50_75K", "50_75k": "K50_75K",
  "75k_100k": "K75_100K", "75_100k": "K75_100K",
  "100k_150k": "K100_150K", "100_150k": "K100_150K",
  "150k_200k": "K150_200K", "150_200k": "K150_200K",
  over_200k: "OVER_200K", "200k_plus": "OVER_200K",
  prefer_not_to_say: "PREFER_NOT_TO_SAY",
};

const FAMILY_MAP: Record<string, "SINGLE_NO_KIDS" | "SINGLE_WITH_KIDS" | "COUPLE_NO_KIDS" | "COUPLE_WITH_KIDS" | "MULTIGENERATIONAL" | "ROOMMATES" | "OTHER" | "PREFER_NOT_TO_SAY"> = {
  single: "SINGLE_NO_KIDS", single_no_kids: "SINGLE_NO_KIDS",
  single_with_kids: "SINGLE_WITH_KIDS", single_parent: "SINGLE_WITH_KIDS",
  couple_no_kids: "COUPLE_NO_KIDS", married_no_kids: "COUPLE_NO_KIDS",
  couple_with_kids: "COUPLE_WITH_KIDS", married_with_kids: "COUPLE_WITH_KIDS", family_with_kids: "COUPLE_WITH_KIDS",
  multigenerational: "MULTIGENERATIONAL", extended_family: "MULTIGENERATIONAL",
  roommates: "ROOMMATES", shared_household: "ROOMMATES",
  other: "OTHER",
  prefer_not_to_say: "PREFER_NOT_TO_SAY",
};

export function mapEnumValue<T extends string>(map: Record<string, T>, value: string | null | undefined): T | null {
  if (!value) return null;
  const key = value.trim().toLowerCase().replace(/[\s+-]+/g, "_").replace(/[$,<>]/g, "");
  return map[key] ?? null;
}

/** Look up a panelist by external id, creating a stub when enabled. */
async function resolvePanelist(externalId: string, row: CsvRow): Promise<string | null> {
  const existing = await db
    .select({ id: panelists.id })
    .from(panelists)
    .where(eq(panelists.panelistId, externalId))
    .limit(1);
  if (existing[0]) return existing[0].id;
  if (!env.autoCreateStubPanelists) return null;

  const [created] = await db
    .insert(panelists)
    .values({
      panelistId: externalId,
      isStub: true,
      age: row.age ?? null,
      sex: mapEnumValue(SEX_MAP, row.sex),
      race: mapEnumValue(RACE_MAP, row.race),
      country: row.country ?? null,
      state: row.state ?? null,
      city: row.city ?? null,
      householdIncome: mapEnumValue(INCOME_MAP, row.household_income),
      familyMakeup: mapEnumValue(FAMILY_MAP, row.family_makeup),
      householdSize: row.household_size ?? null,
      childrenCount: row.children_count ?? null,
    })
    .onConflictDoNothing({ target: panelists.panelistId })
    .returning({ id: panelists.id });
  if (created) return created.id;

  // Lost a race with a concurrent insert: read the winner.
  const retry = await db
    .select({ id: panelists.id })
    .from(panelists)
    .where(eq(panelists.panelistId, externalId))
    .limit(1);
  return retry[0]?.id ?? null;
}

export async function runParseJob(studyDataId: string): Promise<void> {
  const [file] = await db.select().from(studyData).where(eq(studyData.id, studyDataId)).limit(1);
  if (!file) throw new Error(`StudyData not found: ${studyDataId}`);

  await db.update(studyData).set({ status: "PARSING", error: null }).where(eq(studyData.id, studyDataId));

  try {
    const csvFiles = await extractCsvFiles(file.storagePath, file.fileType);
    const skipped: string[] = [];
    const panelistIds = new Set<string>();
    let totalRows = 0;

    for (const csvFile of csvFiles) {
      const records = parse(csvFile.content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        bom: true,
      }) as Record<string, string>[];

      const inserts: Array<typeof responses.$inferInsert> = [];
      const panelistCache = new Map<string, string | null>();

      for (let i = 0; i < records.length; i++) {
        const raw = applyAliases(normalizeRecord(records[i]));
        const parsed = csvRowSchema.safeParse(raw);
        if (!parsed.success) {
          // Report the column and reason only, never the row's content.
          if (skipped.length < 25) {
            const reason = parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ");
            skipped.push(`${csvFile.name} line ${i + 2} - ${reason}`);
          }
          continue;
        }
        const row = parsed.data;

        if (!panelistCache.has(row.panelist_id)) {
          panelistCache.set(row.panelist_id, await resolvePanelist(row.panelist_id, row));
        }
        const panelistUuid = panelistCache.get(row.panelist_id) ?? null;
        if (panelistUuid) panelistIds.add(panelistUuid);

        // Anything not part of the known schema is preserved as structured data.
        const extras: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw)) {
          if (!RESERVED_COLUMNS.has(k) && v) extras[k] = v;
        }

        inserts.push({
          studyId: file.studyId,
          legId: file.legId,
          studyDataId: file.id,
          panelistId: panelistUuid,
          panelistExternalId: row.panelist_id,
          question: row.question ?? null,
          feedbackText: row.feedback,
          structuredAttrs: Object.keys(extras).length > 0 ? extras : null,
        });
        totalRows++;
      }

      for (let i = 0; i < inserts.length; i += INSERT_CHUNK) {
        await db.insert(responses).values(inserts.slice(i, i + INSERT_CHUNK));
      }
    }

    // Record participation: study level and leg level.
    if (panelistIds.size > 0) {
      const ids = [...panelistIds];
      await db
        .insert(studyPanelists)
        .values(ids.map((panelistId) => ({ studyId: file.studyId, panelistId })))
        .onConflictDoNothing();
      await db
        .insert(legPanelists)
        .values(ids.map((panelistId) => ({ legId: file.legId, panelistId })))
        .onConflictDoNothing();
    }

    if (totalRows === 0) {
      throw new Error(
        `No valid rows found. Required columns: panelist_id, feedback.${skipped.length > 0 ? ` First issue: ${skipped[0]}` : ""}`
      );
    }

    await db
      .update(studyData)
      .set({
        status: "PARSED",
        rowCount: totalRows,
        error: skipped.length > 0 ? `Skipped ${skipped.length} invalid row(s):\n${skipped.join("\n")}` : null,
      })
      .where(eq(studyData.id, studyDataId));

    const [study] = await db.select({ status: studies.status }).from(studies).where(eq(studies.id, file.studyId)).limit(1);
    if (study?.status === "DRAFT") {
      await db.update(studies).set({ status: "COLLECTING", updatedAt: new Date() }).where(eq(studies.id, file.studyId));
    }

    console.log(`[parse] ${file.storedFilename}: ${totalRows} rows, ${skipped.length} skipped`);
  } catch (e) {
    await db
      .update(studyData)
      .set({ status: "FAILED", error: (e as Error).message })
      .where(eq(studyData.id, studyDataId));
    throw e;
  }
}
