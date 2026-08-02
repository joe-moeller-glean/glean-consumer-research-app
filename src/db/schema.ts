import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  real,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------- Enums ----------
export const roleEnum = pgEnum("role", ["ADMIN", "RESEARCHER", "VIEWER"]);
export const studyStatusEnum = pgEnum("study_status", [
  "DRAFT",
  "COLLECTING",
  "PROCESSING",
  "ANALYZED",
  "ARCHIVED",
]);
export const sexEnum = pgEnum("sex", [
  "MALE",
  "FEMALE",
  "NONBINARY",
  "OTHER",
  "PREFER_NOT_TO_SAY",
]);
export const raceEnum = pgEnum("race", [
  "AMERICAN_INDIAN_ALASKA_NATIVE",
  "ASIAN",
  "BLACK_AFRICAN_AMERICAN",
  "NATIVE_HAWAIIAN_PACIFIC_ISLANDER",
  "WHITE",
  "MULTIRACIAL",
  "OTHER",
  "PREFER_NOT_TO_SAY",
]);
export const incomeBandEnum = pgEnum("income_band", [
  "UNDER_25K",
  "K25_50K",
  "K50_75K",
  "K75_100K",
  "K100_150K",
  "K150_200K",
  "OVER_200K",
  "PREFER_NOT_TO_SAY",
]);
export const familyMakeupEnum = pgEnum("family_makeup", [
  "SINGLE_NO_KIDS",
  "SINGLE_WITH_KIDS",
  "COUPLE_NO_KIDS",
  "COUPLE_WITH_KIDS",
  "MULTIGENERATIONAL",
  "ROOMMATES",
  "OTHER",
  "PREFER_NOT_TO_SAY",
]);
export const fileTypeEnum = pgEnum("file_type", ["CSV", "ZIP"]);
export const uploadStatusEnum = pgEnum("upload_status", [
  "UPLOADED",
  "PARSING",
  "PARSED",
  "PROCESSING",
  "COMPLETE",
  "FAILED",
]);
export const sentimentEnum = pgEnum("sentiment", ["LIKE", "DISLIKE", "INDIFFERENT"]);
export const batchStatusEnum = pgEnum("batch_status", [
  "VALIDATING",
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "EXPIRED",
]);
export const analysisStatusEnum = pgEnum("analysis_status", [
  "PENDING",
  "RUNNING",
  "COMPLETE",
  "FAILED",
]);

// ---------- Users ----------
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  passwordHash: text("password_hash"),
  role: roleEnum("role").notNull().default("RESEARCHER"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Studies ----------
export const studies = pgTable(
  "studies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 300 }).notNull(),
    product: varchar("product", { length: 300 }).notNull(),
    productVersion: varchar("product_version", { length: 100 }).notNull(),
    testCriteria: text("test_criteria").notNull(),
    description: text("description"),
    category: varchar("category", { length: 200 }),
    status: studyStatusEnum("status").notNull().default("DRAFT"),
    targetPanelSize: integer("target_panel_size"),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("studies_status_idx").on(t.status), index("studies_product_idx").on(t.product)]
);

// ---------- Legs ----------
export const legs = pgTable(
  "legs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studyId: uuid("study_id")
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 300 }).notNull(),
    sequence: integer("sequence").notNull().default(1),
    description: text("description"),
    testVariant: varchar("test_variant", { length: 300 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("legs_study_idx").on(t.studyId)]
);

// ---------- Panelists ----------
export const panelists = pgTable(
  "panelists",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    panelistId: varchar("panelist_id", { length: 100 }).notNull().unique(),
    age: integer("age"),
    sex: sexEnum("sex"),
    race: raceEnum("race"),
    country: varchar("country", { length: 120 }),
    state: varchar("state", { length: 120 }),
    city: varchar("city", { length: 160 }),
    householdIncome: incomeBandEnum("household_income"),
    familyMakeup: familyMakeupEnum("family_makeup"),
    householdSize: integer("household_size"),
    childrenCount: integer("children_count"),
    notes: text("notes"),
    isStub: boolean("is_stub").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("panelists_panelist_id_idx").on(t.panelistId)]
);

// ---------- StudyPanelist / LegPanelist joins ----------
export const studyPanelists = pgTable(
  "study_panelists",
  {
    studyId: uuid("study_id")
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    panelistId: uuid("panelist_id")
      .notNull()
      .references(() => panelists.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.studyId, t.panelistId] })]
);

export const legPanelists = pgTable(
  "leg_panelists",
  {
    legId: uuid("leg_id")
      .notNull()
      .references(() => legs.id, { onDelete: "cascade" }),
    panelistId: uuid("panelist_id")
      .notNull()
      .references(() => panelists.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 100 }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.legId, t.panelistId] })]
);

// ---------- StudyData (uploaded file metadata) ----------
export const studyData = pgTable(
  "study_data",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studyId: uuid("study_id")
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    legId: uuid("leg_id")
      .notNull()
      .references(() => legs.id, { onDelete: "cascade" }),
    originalFilename: varchar("original_filename", { length: 500 }).notNull(),
    storedFilename: varchar("stored_filename", { length: 700 }).notNull(),
    storagePath: text("storage_path").notNull(),
    fileType: fileTypeEnum("file_type").notNull().default("CSV"),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    rowCount: integer("row_count"),
    checksum: varchar("checksum", { length: 128 }),
    status: uploadStatusEnum("status").notNull().default("UPLOADED"),
    error: text("error"),
    uploadedById: uuid("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("study_data_study_idx").on(t.studyId), index("study_data_leg_idx").on(t.legId)]
);

// ---------- Responses (parsed consumer feedback) ----------
export const responses = pgTable(
  "responses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studyId: uuid("study_id")
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    legId: uuid("leg_id")
      .notNull()
      .references(() => legs.id, { onDelete: "cascade" }),
    studyDataId: uuid("study_data_id")
      .notNull()
      .references(() => studyData.id, { onDelete: "cascade" }),
    panelistId: uuid("panelist_id").references(() => panelists.id, { onDelete: "set null" }),
    panelistExternalId: varchar("panelist_external_id", { length: 100 }),
    question: text("question"),
    feedbackText: text("feedback_text").notNull(),
    structuredAttrs: jsonb("structured_attrs"),
    sentiment: sentimentEnum("sentiment"),
    sentimentScore: real("sentiment_score"),
    sentimentModel: varchar("sentiment_model", { length: 300 }),
    sentimentOverridden: boolean("sentiment_overridden").notNull().default(false),
    flaggedForReview: boolean("flagged_for_review").notNull().default(false),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("responses_study_idx").on(t.studyId),
    index("responses_leg_idx").on(t.legId),
    index("responses_panelist_idx").on(t.panelistId),
    index("responses_sentiment_idx").on(t.sentiment),
  ]
);

// ---------- SentimentBatch (Fireworks Batch job tracking) ----------
export const sentimentBatches = pgTable(
  "sentiment_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studyId: uuid("study_id")
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    studyDataId: uuid("study_data_id").references(() => studyData.id, { onDelete: "set null" }),
    fireworksJobId: varchar("fireworks_job_id", { length: 300 }),
    inputDatasetId: varchar("input_dataset_id", { length: 300 }),
    outputDatasetId: varchar("output_dataset_id", { length: 300 }),
    requestCount: integer("request_count").notNull().default(0),
    status: batchStatusEnum("status").notNull().default("PENDING"),
    error: text("error"),
    continuedFromId: uuid("continued_from_id"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("sentiment_batches_job_idx").on(t.fireworksJobId),
    index("sentiment_batches_study_idx").on(t.studyId),
  ]
);

// ---------- StudyAnalysis (Glean overall analysis runs) ----------
export const studyAnalyses = pgTable(
  "study_analyses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studyId: uuid("study_id")
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    status: analysisStatusEnum("status").notNull().default("PENDING"),
    inputJson: jsonb("input_json"),
    outputText: text("output_text"),
    model: varchar("model", { length: 300 }),
    error: text("error"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("study_analyses_study_idx").on(t.studyId)]
);

// ---------- Relations ----------
export const usersRelations = relations(users, ({ many }) => ({
  studies: many(studies),
  uploads: many(studyData),
  analyses: many(studyAnalyses),
}));

export const studiesRelations = relations(studies, ({ one, many }) => ({
  createdBy: one(users, { fields: [studies.createdById], references: [users.id] }),
  legs: many(legs),
  files: many(studyData),
  responses: many(responses),
  studyPanelists: many(studyPanelists),
  analyses: many(studyAnalyses),
  batches: many(sentimentBatches),
}));

export const legsRelations = relations(legs, ({ one, many }) => ({
  study: one(studies, { fields: [legs.studyId], references: [studies.id] }),
  files: many(studyData),
  responses: many(responses),
  legPanelists: many(legPanelists),
}));

export const panelistsRelations = relations(panelists, ({ many }) => ({
  studyLinks: many(studyPanelists),
  legLinks: many(legPanelists),
  responses: many(responses),
}));

export const studyPanelistsRelations = relations(studyPanelists, ({ one }) => ({
  study: one(studies, { fields: [studyPanelists.studyId], references: [studies.id] }),
  panelist: one(panelists, { fields: [studyPanelists.panelistId], references: [panelists.id] }),
}));

export const legPanelistsRelations = relations(legPanelists, ({ one }) => ({
  leg: one(legs, { fields: [legPanelists.legId], references: [legs.id] }),
  panelist: one(panelists, { fields: [legPanelists.panelistId], references: [panelists.id] }),
}));

export const studyDataRelations = relations(studyData, ({ one, many }) => ({
  study: one(studies, { fields: [studyData.studyId], references: [studies.id] }),
  leg: one(legs, { fields: [studyData.legId], references: [legs.id] }),
  uploadedBy: one(users, { fields: [studyData.uploadedById], references: [users.id] }),
  responses: many(responses),
}));

export const responsesRelations = relations(responses, ({ one }) => ({
  study: one(studies, { fields: [responses.studyId], references: [studies.id] }),
  leg: one(legs, { fields: [responses.legId], references: [legs.id] }),
  studyData: one(studyData, { fields: [responses.studyDataId], references: [studyData.id] }),
  panelist: one(panelists, { fields: [responses.panelistId], references: [panelists.id] }),
}));

export const sentimentBatchesRelations = relations(sentimentBatches, ({ one }) => ({
  study: one(studies, { fields: [sentimentBatches.studyId], references: [studies.id] }),
  studyData: one(studyData, { fields: [sentimentBatches.studyDataId], references: [studyData.id] }),
}));

export const studyAnalysesRelations = relations(studyAnalyses, ({ one }) => ({
  study: one(studies, { fields: [studyAnalyses.studyId], references: [studies.id] }),
  createdBy: one(users, { fields: [studyAnalyses.createdById], references: [users.id] }),
}));

// ---------- Types ----------
export type User = typeof users.$inferSelect;
export type Study = typeof studies.$inferSelect;
export type Leg = typeof legs.$inferSelect;
export type Panelist = typeof panelists.$inferSelect;
export type StudyData = typeof studyData.$inferSelect;
export type Response = typeof responses.$inferSelect;
export type SentimentBatch = typeof sentimentBatches.$inferSelect;
export type StudyAnalysis = typeof studyAnalyses.$inferSelect;
