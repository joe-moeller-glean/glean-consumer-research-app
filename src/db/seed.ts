import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db, pool } from "./index";
import { users, studies, legs, panelists, studyPanelists, legPanelists, studyData, responses } from "./schema";
import { env } from "@/lib/env";

/**
 * Demo seed: two users, a panel of 40 panelists, and one study with two legs of
 * pre-classified feedback so the dashboard and charts are populated immediately.
 * Run with: npm run db:seed
 */

const FIRST_NAMES_CITIES = [
  ["Austin", "TX"], ["Denver", "CO"], ["Chicago", "IL"], ["Seattle", "WA"],
  ["Miami", "FL"], ["Boston", "MA"], ["Phoenix", "AZ"], ["Atlanta", "GA"],
];

const SEXES = ["MALE", "FEMALE", "NONBINARY"] as const;
const RACES = ["WHITE", "BLACK_AFRICAN_AMERICAN", "ASIAN", "MULTIRACIAL", "OTHER"] as const;
const INCOMES = ["UNDER_25K", "K25_50K", "K50_75K", "K75_100K", "K100_150K", "K150_200K", "OVER_200K"] as const;
const FAMILIES = [
  "SINGLE_NO_KIDS", "SINGLE_WITH_KIDS", "COUPLE_NO_KIDS",
  "COUPLE_WITH_KIDS", "MULTIGENERATIONAL", "ROOMMATES",
] as const;

const LIKE_FEEDBACK = [
  "I love the crisp citrus finish, it is really refreshing.",
  "Great balance of sweetness, this is my new favorite.",
  "Tastes amazing cold, I would buy this every week.",
  "Excellent flavor and the aftertaste is smooth.",
  "Really enjoy how light it feels, perfect for the afternoon.",
];
const DISLIKE_FEEDBACK = [
  "The aftertaste is bitter and honestly pretty awful.",
  "Too sweet for me, it tastes artificial and stale.",
  "I disliked the smell, and the flavor is bland.",
  "Terrible texture, would not buy this again.",
  "Weird chemical taste, the worst of the ones I tried.",
];
const NEUTRAL_FEEDBACK = [
  "It is fine. Nothing really stands out either way.",
  "Tastes about the same as other brands I have had.",
  "No strong opinion, I could drink it or not.",
  "Fairly average, does the job.",
  "Neither good nor bad, quite forgettable.",
];

// Deterministic pseudo-random so repeated seeds look the same.
let seedState = 42;
function rand(): number {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

async function main() {
  console.log("Seeding demo data...");

  const existing = await db.select({ id: studies.id }).from(studies).limit(1);
  if (existing.length > 0) {
    console.log("Studies already exist. Clearing demo data first...");
    await db.execute(sql`TRUNCATE studies, panelists RESTART IDENTITY CASCADE`);
  }

  // --- Users ---
  const adminHash = await bcrypt.hash(env.seedAdminPassword, 12);
  const [admin] = await db
    .insert(users)
    .values({ email: env.seedAdminEmail, name: "Admin", passwordHash: adminHash, role: "ADMIN" })
    .onConflictDoUpdate({ target: users.email, set: { passwordHash: adminHash } })
    .returning();

  await db
    .insert(users)
    .values({
      email: "researcher@example.com",
      name: "Riley Researcher",
      passwordHash: await bcrypt.hash("research1234", 12),
      role: "RESEARCHER",
    })
    .onConflictDoNothing();

  await db
    .insert(users)
    .values({
      email: "viewer@example.com",
      name: "Vic Viewer",
      passwordHash: await bcrypt.hash("viewer1234", 12),
      role: "VIEWER",
    })
    .onConflictDoNothing();

  // --- Panelists ---
  const panelistRows = Array.from({ length: 40 }, (_, i) => {
    const [city, state] = pick(FIRST_NAMES_CITIES);
    const family = pick(FAMILIES);
    const hasKids = family === "SINGLE_WITH_KIDS" || family === "COUPLE_WITH_KIDS";
    return {
      panelistId: `P-${(1000 + i).toString()}`,
      age: 18 + Math.floor(rand() * 55),
      sex: pick(SEXES),
      race: pick(RACES),
      country: "United States",
      state,
      city,
      householdIncome: pick(INCOMES),
      familyMakeup: family,
      householdSize: 1 + Math.floor(rand() * 5),
      childrenCount: hasKids ? 1 + Math.floor(rand() * 3) : 0,
    };
  });
  const insertedPanelists = await db.insert(panelists).values(panelistRows).returning({ id: panelists.id });

  // --- Study + legs ---
  const [study] = await db
    .insert(studies)
    .values({
      name: "Spring 2026 citrus reformulation test",
      product: "Sparkling water",
      productVersion: "v2.3 citrus",
      testCriteria:
        "Compare consumer preference for the reformulated citrus flavor (Formula B) against the current production formula (Formula A), unbranded.",
      category: "Beverage",
      description: "Two-leg blind taste test with a 40-person national panel.",
      status: "ANALYZED",
      targetPanelSize: 40,
      createdById: admin.id,
    })
    .returning();

  const insertedLegs = await db
    .insert(legs)
    .values([
      { studyId: study.id, name: "Leg 1: Formula A (control)", sequence: 1, testVariant: "Formula A" },
      { studyId: study.id, name: "Leg 2: Formula B (reformulated)", sequence: 2, testVariant: "Formula B" },
    ])
    .returning();

  // --- Participation ---
  await db
    .insert(studyPanelists)
    .values(insertedPanelists.map((p) => ({ studyId: study.id, panelistId: p.id })));
  for (const leg of insertedLegs) {
    await db.insert(legPanelists).values(insertedPanelists.map((p) => ({ legId: leg.id, panelistId: p.id })));
  }

  // --- Files + responses (pre-classified, as if a batch already ran) ---
  for (const [index, leg] of insertedLegs.entries()) {
    const filename = `leg${index + 1}-feedback.csv`;
    const [file] = await db
      .insert(studyData)
      .values({
        studyId: study.id,
        legId: leg.id,
        originalFilename: filename,
        storedFilename: `${study.id}_${leg.id}__${filename}`,
        storagePath: `${env.uploadsDir}/${study.id}/${study.id}_${leg.id}__${filename}`,
        fileType: "CSV",
        sizeBytes: 4096,
        rowCount: insertedPanelists.length,
        status: "COMPLETE",
        uploadedById: admin.id,
      })
      .returning();

    // Formula B (leg 2) is deliberately better received than Formula A.
    const likeWeight = index === 0 ? 0.42 : 0.63;
    const dislikeWeight = index === 0 ? 0.35 : 0.18;

    await db.insert(responses).values(
      insertedPanelists.map((p) => {
        const roll = rand();
        const [sentiment, text] =
          roll < likeWeight
            ? (["LIKE", pick(LIKE_FEEDBACK)] as const)
            : roll < likeWeight + dislikeWeight
              ? (["DISLIKE", pick(DISLIKE_FEEDBACK)] as const)
              : (["INDIFFERENT", pick(NEUTRAL_FEEDBACK)] as const);

        return {
          studyId: study.id,
          legId: leg.id,
          studyDataId: file.id,
          panelistId: p.id,
          panelistExternalId: null,
          question: "What did you think of the sample you just tried?",
          feedbackText: text,
          sentiment,
          sentimentScore: 0.8 + rand() * 0.2,
          sentimentModel: "seed-demo",
          analyzedAt: new Date(),
        };
      })
    );
  }

  console.log(`Seeded study "${study.name}" with 2 legs and ${insertedPanelists.length * 2} responses.`);
  console.log(`Sign in as ${env.seedAdminEmail} / ${env.seedAdminPassword}`);
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
