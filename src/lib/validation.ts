import { z } from "zod";

const sexEnum = z.enum(["MALE", "FEMALE", "NONBINARY", "OTHER", "PREFER_NOT_TO_SAY"]);
const raceEnum = z.enum([
  "AMERICAN_INDIAN_ALASKA_NATIVE",
  "ASIAN",
  "BLACK_AFRICAN_AMERICAN",
  "NATIVE_HAWAIIAN_PACIFIC_ISLANDER",
  "WHITE",
  "MULTIRACIAL",
  "OTHER",
  "PREFER_NOT_TO_SAY",
]);
const incomeEnum = z.enum([
  "UNDER_25K",
  "K25_50K",
  "K50_75K",
  "K75_100K",
  "K100_150K",
  "K150_200K",
  "OVER_200K",
  "PREFER_NOT_TO_SAY",
]);
const familyEnum = z.enum([
  "SINGLE_NO_KIDS",
  "SINGLE_WITH_KIDS",
  "COUPLE_NO_KIDS",
  "COUPLE_WITH_KIDS",
  "MULTIGENERATIONAL",
  "ROOMMATES",
  "OTHER",
  "PREFER_NOT_TO_SAY",
]);

export const userCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  password: z.string().min(8).max(200),
  role: z.enum(["ADMIN", "RESEARCHER", "VIEWER"]).default("RESEARCHER"),
});

export const userUpdateSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).max(200).optional(),
  password: z.string().min(8).max(200).optional(),
  role: z.enum(["ADMIN", "RESEARCHER", "VIEWER"]).optional(),
  active: z.boolean().optional(),
});

export const studyCreateSchema = z.object({
  name: z.string().min(1).max(300),
  product: z.string().min(1).max(300),
  productVersion: z.string().min(1).max(100),
  testCriteria: z.string().min(1),
  description: z.string().optional().nullable(),
  category: z.string().max(200).optional().nullable(),
  status: z.enum(["DRAFT", "COLLECTING", "PROCESSING", "ANALYZED", "ARCHIVED"]).default("DRAFT"),
  targetPanelSize: z.number().int().positive().optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
});

export const studyUpdateSchema = studyCreateSchema.partial();

export const legCreateSchema = z.object({
  name: z.string().min(1).max(300),
  sequence: z.number().int().min(1).default(1),
  description: z.string().optional().nullable(),
  testVariant: z.string().max(300).optional().nullable(),
});

export const legUpdateSchema = legCreateSchema.partial();

export const panelistCreateSchema = z.object({
  panelistId: z.string().min(1).max(100),
  age: z.number().int().min(0).max(120).optional().nullable(),
  sex: sexEnum.optional().nullable(),
  race: raceEnum.optional().nullable(),
  country: z.string().max(120).optional().nullable(),
  state: z.string().max(120).optional().nullable(),
  city: z.string().max(160).optional().nullable(),
  householdIncome: incomeEnum.optional().nullable(),
  familyMakeup: familyEnum.optional().nullable(),
  householdSize: z.number().int().min(0).max(50).optional().nullable(),
  childrenCount: z.number().int().min(0).max(30).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const panelistUpdateSchema = panelistCreateSchema.partial().omit({ panelistId: true });

export const responseUpdateSchema = z.object({
  sentiment: z.enum(["LIKE", "DISLIKE", "INDIFFERENT"]),
});

export const sentimentOutputSchema = z.object({
  sentiment: z
    .string()
    .transform((s) => s.toUpperCase())
    .pipe(z.enum(["LIKE", "DISLIKE", "INDIFFERENT"])),
  confidence: z.number().min(0).max(1).optional(),
});

export type UserCreate = z.infer<typeof userCreateSchema>;
export type StudyCreate = z.infer<typeof studyCreateSchema>;
export type LegCreate = z.infer<typeof legCreateSchema>;
export type PanelistCreate = z.infer<typeof panelistCreateSchema>;
