/**
 * Loads the committed seed fixtures into the database.
 *
 *   npm run db:seed
 *
 * Reads:
 *   ./panelists.json        the panel (demographics)
 *   ./responses/*.csv       one collected-response file per study leg
 *   ./studies.ts            study and leg metadata
 *
 * Users, studies, legs, and participation links are created here; questions and
 * response text come entirely from the CSV files.
 */

import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { parse } from "csv-parse/sync";
import { sql } from "drizzle-orm";
import { db, pool } from "../index";
import {
  users,
  studies,
  legs,
  panelists,
  studyPanelists,
  legPanelists,
  studyData,
  responses,
} from "../schema";
import { STUDIES } from "./studies";
import { env } from "@/lib/env";

const SEED_DIR = __dirname;
const CHUNK = 1000;

type Sentiment = "LIKE" | "DISLIKE" | "INDIFFERENT";

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

interface CsvRow {
  panelist_id: string;
  question: string;
  feedback: string;
  /**
   * Human-coded ground truth from the research vendor. Used here to pre-populate
   * sentiment so the dashboard has data without waiting on a batch inference run.
   * Real uploads have no such column: the Fireworks model supplies the sentiment.
   */
  coded_sentiment: Sentiment;
  responded_at: string;
}

async function insertChunked<T>(rows: T[], fn: (batch: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await fn(rows.slice(i, i + CHUNK));
  }
}

async function main() {
  console.log("Seeding from fixtures in src/db/seed ...");

  // Start clean so re-running is idempotent. Users are preserved.
  await db.execute(sql`TRUNCATE studies, panelists RESTART IDENTITY CASCADE`);

  // --- Users -------------------------------------------------------------
  const adminHash = await bcrypt.hash(env.seedAdminPassword, 12);
  const [admin] = await db
    .insert(users)
    .values({ email: env.seedAdminEmail, name: "Avery Admin", passwordHash: adminHash, role: "ADMIN" })
    .onConflictDoUpdate({ target: users.email, set: { passwordHash: adminHash } })
    .returning();

  for (const [email, name, role, password] of [
    ["researcher@example.com", "Riley Researcher", "RESEARCHER", "research1234"],
    ["viewer@example.com", "Vic Viewer", "VIEWER", "viewer1234"],
  ] as const) {
    await db
      .insert(users)
      .values({ email, name, role, passwordHash: await bcrypt.hash(password, 12) })
      .onConflictDoNothing();
  }

  // --- Panelists ---------------------------------------------------------
  const panelFile = path.join(SEED_DIR, "panelists.json");
  const panelRecords: PanelistRecord[] = JSON.parse(fs.readFileSync(panelFile, "utf8"));

  const panelistIdMap = new Map<string, string>();
  await insertChunked(panelRecords, async (batch) => {
    const inserted = await db
      .insert(panelists)
      .values(
        batch.map((p) => ({
          panelistId: p.panelist_id,
          age: p.age,
          sex: p.sex as never,
          race: p.race as never,
          country: p.country,
          state: p.state,
          city: p.city,
          householdIncome: p.household_income as never,
          familyMakeup: p.family_makeup as never,
          householdSize: p.household_size,
          childrenCount: p.children_count,
          profileComplete: p.age !== null && p.sex !== null && p.household_income !== null,
        }))
      )
      .returning({ id: panelists.id, panelistId: panelists.panelistId });
    inserted.forEach((row) => panelistIdMap.set(row.panelistId, row.id));
  });
  console.log(`  panelists: ${panelistIdMap.size}`);

  // --- Studies -----------------------------------------------------------
  let totalResponses = 0;

  for (const def of STUDIES) {
    const [study] = await db
      .insert(studies)
      .values({
        name: def.name,
        product: def.product,
        productVersion: def.productVersion,
        category: def.category,
        testCriteria: def.testCriteria,
        description: def.description,
        targetPanelSize: def.targetPanelSize,
        status: "ANALYZED",
        createdById: admin.id,
      })
      .returning();

    const studyPanelistIds = new Set<string>();

    for (const [index, legDef] of def.legs.entries()) {
      const [leg] = await db
        .insert(legs)
        .values({
          studyId: study.id,
          name: legDef.name,
          sequence: index + 1,
          testVariant: legDef.testVariant,
        })
        .returning();

      const csvPath = path.join(SEED_DIR, "responses", legDef.file);
      const raw = fs.readFileSync(csvPath);
      const rows: CsvRow[] = parse(raw, { columns: true, skipEmptyLines: true, trim: true });

      // File metadata mirrors what a real upload of this CSV would produce.
      const [file] = await db
        .insert(studyData)
        .values({
          studyId: study.id,
          legId: leg.id,
          originalFilename: legDef.file,
          storedFilename: `${study.id}_${leg.id}__${legDef.file}`,
          storagePath: path.join(env.uploadsDir, study.id, `${study.id}_${leg.id}__${legDef.file}`),
          fileType: "CSV",
          sizeBytes: raw.byteLength,
          rowCount: rows.length,
          status: "COMPLETE",
          uploadedById: admin.id,
        })
        .returning();

      const legPanelistIds = new Set<string>();
      const responseRows = rows.flatMap((row) => {
        const panelistUuid = panelistIdMap.get(row.panelist_id);
        if (!panelistUuid) return [];
        legPanelistIds.add(panelistUuid);
        studyPanelistIds.add(panelistUuid);
        return [
          {
            studyId: study.id,
            legId: leg.id,
            studyDataId: file.id,
            panelistId: panelistUuid,
            panelistExternalId: row.panelist_id,
            question: row.question,
            feedbackText: row.feedback,
            sentiment: row.coded_sentiment,
            sentimentModel: "vendor-coded",
            analyzedAt: new Date(`${row.responded_at}T12:00:00Z`),
          },
        ];
      });

      await insertChunked(responseRows, (batch) => db.insert(responses).values(batch));
      await insertChunked([...legPanelistIds], (batch) =>
        db.insert(legPanelists).values(batch.map((id) => ({ legId: leg.id, panelistId: id })))
      );

      totalResponses += responseRows.length;
      console.log(`  ${def.slug} / ${legDef.file}: ${responseRows.length} responses`);
    }

    await insertChunked([...studyPanelistIds], (batch) =>
      db.insert(studyPanelists).values(batch.map((id) => ({ studyId: study.id, panelistId: id })))
    );
  }

  console.log(`\nSeeded ${STUDIES.length} studies and ${totalResponses} responses.`);
  console.log(`Sign in as ${env.seedAdminEmail} / ${env.seedAdminPassword}`);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
