import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  studyData,
  responses,
  panelists,
  studyPanelists,
  legPanelists,
  studies,
} from "@/db/schema";
import { readFile } from "@/lib/storage";
import { normalizeRecord, applyAliases, csvRowSchema, RESERVED_COLUMNS } from "@/lib/csv";
import { env } from "@/lib/env";

/**
 * Parse job: read an uploaded StudyData file (CSV or ZIP of CSVs),
 * create Response rows, link/create panelists, mark file PARSED.
 */

type CsvFile = { name: string; content: string };

async function extractCsvFiles(storagePath: string, fileType: string): Promise<CsvFile[]> {
  const buf = await readFile(storagePath);
  if (fileType === "ZIP") {
    const zip = new AdmZip(buf);
    return zip
      .getEntries()
      .filter((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith(".csv"))
      .map((e) => ({ name: e.entryName, content: e.getData().toString("utf8") }));
  }
  return [{ name: storagePath, content: buf.toString("utf8") }];
}

const SEX_MAP: Record<string, "MALE" | "FEMALE" | "NONBINARY" | "OTHER" | "PREFER_NOT_TO_SAY"> = {
  male: "MALE", m: "MALE",
  female: "FEMALE", f: "FEMALE",
  nonbinary: "NONBINARY", "non-binary": "NONBINARY", nb: "NONBINARY",
  other: "OTHER",
  prefer_not_to_say: "PREFER_NOT_TO_SAY",
};

const RACE_MAP: Record<string, "ASIAN" | "BLACK_AFRICAN_AMERICAN" | "WHITE" | "MULTIRACIAL" | "AMERICAN_INDIAN_ALASKA_NATIVE" | "NATIVE_HAWAIIAN_PACIFIC_ISLANDER" | "OTHER" | "PREFER_NOT_TO_SAY"> = {
  asian: "ASIAN",
  black: "BLACK_AFRICAN_AMERICAN", black_african_american: "BLACK_AFRICAN_AMERICAN", african_american: "BLACK_AFRICAN_AMERICAN",
  white: "WHITE", caucasian: "WHITE",
  multiracial: "MULTIRACIAL", mixed: "MULTIRACIAL", two_or_more: "MULTIRACIAL",
  american_indian: "AMERICAN_INDIAN_ALASKA_NATIVE", american_indian_alaska_native: "AMERICAN_INDIAN_ALASKA_NATIVE", native_american: "AMERICAN_INDIAN_ALASKA_NATIVE",
  native_hawaiian: "NATIVE_HAWAIIAN_PACIFIC_ISLANDER", native_hawaiian_pacific_islander: "NATIVE_HAWAIIAN_PACIFIC_ISLANDER", pacific_islander: "NATIVE_HAWAIIAN_PACIFIC_ISLANDER",
  hispanic: "OTHER", latino: "OTHER", latina: "OTHER", latinx: "OTHER", other: "OTHER",
  prefer_not_to_say: "PREFER_NOT_TO_SAY",
};

const INCOME_MAP: Record<string, "UNDER_25K" | "K25_50K" | "K50_75K" | "K75_100K" | "K100_150K" | "K150_200K" | "OVER_200K"> = {
  under_25k: "UNDER_25K", "<25k": "UNDER_25K", "0_25k": "UNDER_25K",
  "25k_50k": "K25_50K", "25_50k": "K25_50K",
  "50k_75k": "K50_75K", "50_75k": "K50_75K",
  "75k_100k": "K75_100K", "75_100k": "K75_100K",
  "100k_150k": "K100_150K", "100_150k": "K100_150K",
  "150k_200k": "K150_200K", "150_200k": "K150_200K",
  over_200k: "OVER_200K", "200k+": "OVER_200K", ">200k": "OVER_200K",
};

const FAMILY_MAP: Record<string, "SINGLE_NO_KIDS" | "SINGLE_WITH_KIDS" | "COUPLE_NO_KIDS" | "COUPLE_WITH_KIDS" | "MULTIGENERATIONAL" | "ROOMMATES" | "OTHER"> = {
  single_no_kids: "SINGLE_NO_KIDS", single: "SINGLE_NO_KIDS",
  single_with_kids: "SINGLE_WITH_KIDS", single_parent: "SINGLE_WITH_KIDS",
  couple_no_kids: "COUPLE_NO_KIDS", married_no_kids: "COUPLE_NO_KIDS", dink: "COUPLE_NO_KIDS",
  couple_with_kids: "COUPLE_WITH_KIDS", married_with_kids: "COUPLE_WITH_KIDS", family: "COUPLE_WITH_KIDS",
  multigenerational: "MULTIGENERATIONAL", extended_family: "MULTIGENERATIONAL",
  roommates: "ROOMMATES", shared: "ROOMMATES",
  other: "OTHER",
};

function mapEnum<T extends string>(map: Record<string, T>, value: string | null | undefined): T | undefined {
  if (!value) return undefined;
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return map[key];
}

async function findOrCreatePanelist(
  externalId: string,
  demo: Partial<{
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
  }>
): Promise<string | null> {
  const existing = await db
    .select({ id: panelists.id })
    .from(panelists)
    .where(eq(panelists.panelistId, externalId))
    .limit(1);
  if (existing[0]) return existing[0].id;

  if (!env.autoCreateStubPanelists) return null;

  const created = await db
    .insert(panelists)
    .values({
      panelistId: externalId,
      isStub: true,
      age: demo.age ?? null,
      sex: mapEnum(SEX_MAP, demo.sex),
      race: mapEnum(RACE_MAP, demo.race),
      country: demo.country ?? null,
      state: demo.state ?? null,
      city: demo.city ?? null,
      householdIncome: mapEnum(INCOME_MAP, demo.householdIncome),
      familyMakeup: mapEnum(FAMILY_MAP, demo.familyMakeup),
      householdSize: demo.householdSize ?? null,
      childrenCount: demo.childrenCount ?? null,
    })
    .onConflictDoNothing({ target: panelists.panelistId })
    .returning({ id: panelists.id });

  if (created[0]) return created[0].id;
  const retry = await db.select({ id: panelists.id }).from(panelists).where(eq(panelists.panelistId, externalId)).limit(1);
  return retry[0]?.id ?? null;
}

export async function runParseJob(studyDataId: string): Promise<void> {
  const files = await db.select().from(studyData).where(eq(studyData.id, studyDataId)).limit(1);
  const file = files[0];
  if (!file) throw new Error(`StudyData not found: ${studyDataId}`);

  await db.update(studyData).set({ status: "PARSING" }).where(eq(studyData.id, studyDataId));

  try {
    const csvFiles = await extractCsvFiles(file.storagePath, file.fileType);
    let totalRows = 0;
    const badRows: string[] = [];

    for (const csvFile of csvFiles) {
      const records = parse(csvFile.content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      }) as Record<string, string>[];

      const inserts: Array<typeof responses.$inferInsert> = [];
      const panelistCache = new Map<string, string | null>();

      for (let i = 0; i < records.length; i++) {
        const raw = applyAliases(normalizeRecord(records[i]));
        const parsed = csvRowSchema.safeParse(raw);
        if (!parsed.success) {
          if (badRows.length < 25) badRows.push(`${csvFile.name} row ${i + 2}: ${parsed.error.issues.map((x) => x.path.join(".") + " " + x.message).join(", ")}`);
          continue;
        }
        const row = parsed.data;

        let panelistUuid: string | null;
        if (panelistCache.has(row.panelist_id)) {
          panelistUuid = panelistCache.get(row.panelist_id)!;
        } else {
          panelistUuid = await findOrCreatePanelist(row.panelist_id, row);
          panelistCache.set(row.panelist_id, panelistUuid);
        }

        const structured: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw)) {
          if (!RESERVED_COLUMNS.has(k) && v !== undefined && v !== "") structured[k] = v;
        }

        inserts.push({
          studyId: file.studyId,
          legId: file.legId,
          studyDataId: file.id,
          panelistId: panelistUuid,
          panelistExternalId: row.panelist_id,
          question: row.question ?? null,
          feedbackText: row.feedback,
          structuredAttrs: Object.keys(structured).length > 0 ? structured : null,
        });
        totalRows++;
      }

      // Bulk insert in chunks of 500
      for (let i = 0; i < inserts.length; i += 500) {
        await db.insert(responses).values(inserts.slice(i, i + 500));
      }

      // Link panelists to study + leg (idempotent)
      const linkedIds = [...panelistCache.values()].filter((x): x is string => x !== null);
      for (const pid of linkedIds) {
        await db.insert(studyPanelists).values({ studyId: file.studyId, panelistId: pid }).onConflictDoNothing();
        await db.insert(legPanelists).values({ legId: file.legId, panelistId: pid }).onConflictDoNothing();
      }
    }

    await db
      .update(studyData)
      .set({
        status: "PARSED",
        rowCount: totalRows,
        error: badRows.length > 0 ? `Skipped invalid rows:\n${badRows.join("\n")}` : null,
      })
      .where(eq(studyData.id, studyDataId));

    // Study now has data and is ready for processing
    await db
      .update(studies)
      .set({ status: sql`CASE WHEN status = 'DRAFT' THEN 'COLLECTING' ELSE status END`, updatedAt: new Date() })
      .where(and(eq(studies.id, file.studyId)));
  } catch (e) {
    await db
      .update(studyData)
      .set({ status: "FAILED", error: (e as Error).message })
      .where(eq(studyData.id, studyDataId));
    throw e;
  }
}
