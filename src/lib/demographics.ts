// Age banding — derived at query time so re-banding never requires a data migration.

export const AGE_BANDS = [
  { label: "Under 18", min: 0, max: 17 },
  { label: "18–24", min: 18, max: 24 },
  { label: "25–34", min: 25, max: 34 },
  { label: "35–44", min: 35, max: 44 },
  { label: "45–54", min: 45, max: 54 },
  { label: "55–64", min: 55, max: 64 },
  { label: "65+", min: 65, max: 200 },
] as const;

export const UNKNOWN_BAND = "Unknown";

export function ageBand(age: number | null | undefined): string {
  if (age === null || age === undefined) return UNKNOWN_BAND;
  for (const b of AGE_BANDS) {
    if (age >= b.min && age <= b.max) return b.label;
  }
  return UNKNOWN_BAND;
}

// Canonical ordering for demographic buckets in charts.
export function bandOrder(dimension: string): string[] {
  switch (dimension) {
    case "age":
      return [...AGE_BANDS.map((b) => b.label), UNKNOWN_BAND];
    case "sex":
      return ["MALE", "FEMALE", "NONBINARY", "OTHER", "PREFER_NOT_TO_SAY", UNKNOWN_BAND];
    case "race":
      return [
        "WHITE",
        "BLACK_AFRICAN_AMERICAN",
        "ASIAN",
        "AMERICAN_INDIAN_ALASKA_NATIVE",
        "NATIVE_HAWAIIAN_PACIFIC_ISLANDER",
        "MULTIRACIAL",
        "OTHER",
        "PREFER_NOT_TO_SAY",
        UNKNOWN_BAND,
      ];
    case "income":
      return [
        "UNDER_25K",
        "K25_50K",
        "K50_75K",
        "K75_100K",
        "K100_150K",
        "K150_200K",
        "OVER_200K",
        "PREFER_NOT_TO_SAY",
        UNKNOWN_BAND,
      ];
    case "familyMakeup":
      return [
        "SINGLE_NO_KIDS",
        "SINGLE_WITH_KIDS",
        "COUPLE_NO_KIDS",
        "COUPLE_WITH_KIDS",
        "MULTIGENERATIONAL",
        "ROOMMATES",
        "OTHER",
        "PREFER_NOT_TO_SAY",
        UNKNOWN_BAND,
      ];
    default:
      return [];
  }
}
