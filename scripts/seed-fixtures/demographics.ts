/**
 * Weighted demographic pools used ONLY when generating src/db/seed/panelists.json.
 * Generation time only: the app never reads this file. Weights are deliberately
 * uneven so the seeded panel is randomly, not evenly, distributed.
 */

// ---------------------------------------------------------------------------
// Demographics pools
// ---------------------------------------------------------------------------

export const CITIES: [string, string][] = [
  ["Austin", "TX"], ["Dallas", "TX"], ["Houston", "TX"], ["Denver", "CO"],
  ["Boulder", "CO"], ["Chicago", "IL"], ["Naperville", "IL"], ["Seattle", "WA"],
  ["Tacoma", "WA"], ["Miami", "FL"], ["Orlando", "FL"], ["Tampa", "FL"],
  ["Boston", "MA"], ["Cambridge", "MA"], ["Phoenix", "AZ"], ["Scottsdale", "AZ"],
  ["Atlanta", "GA"], ["Savannah", "GA"], ["New York", "NY"], ["Buffalo", "NY"],
  ["Los Angeles", "CA"], ["San Diego", "CA"], ["Sacramento", "CA"],
  ["Portland", "OR"], ["Minneapolis", "MN"], ["Detroit", "MI"], ["Cleveland", "OH"],
  ["Columbus", "OH"], ["Nashville", "TN"], ["Charlotte", "NC"], ["Raleigh", "NC"],
  ["Philadelphia", "PA"], ["Pittsburgh", "PA"], ["Kansas City", "MO"],
  ["Salt Lake City", "UT"], ["Boise", "ID"], ["New Orleans", "LA"],
];

export const COUNTRIES: { country: string; weight: number }[] = [
  { country: "United States", weight: 72 },
  { country: "Canada", weight: 10 },
  { country: "United Kingdom", weight: 7 },
  { country: "Mexico", weight: 5 },
  { country: "Germany", weight: 3 },
  { country: "Australia", weight: 3 },
];

// Values must match the pgEnum members in src/db/schema.ts. The generator
// asserts this, so a typo fails fast instead of at insert time.
export const SEXES: { value: string; weight: number }[] = [
  { value: "FEMALE", weight: 46 },
  { value: "MALE", weight: 44 },
  { value: "NONBINARY", weight: 5 },
  { value: "OTHER", weight: 2 },
  { value: "PREFER_NOT_TO_SAY", weight: 3 },
];

export const RACES: { value: string; weight: number }[] = [
  { value: "WHITE", weight: 55 },
  { value: "BLACK_AFRICAN_AMERICAN", weight: 15 },
  { value: "ASIAN", weight: 11 },
  { value: "MULTIRACIAL", weight: 7 },
  { value: "AMERICAN_INDIAN_ALASKA_NATIVE", weight: 2 },
  { value: "NATIVE_HAWAIIAN_PACIFIC_ISLANDER", weight: 1.5 },
  { value: "OTHER", weight: 5 },
  { value: "PREFER_NOT_TO_SAY", weight: 3.5 },
];

export const INCOMES: { value: string; weight: number }[] = [
  { value: "UNDER_25K", weight: 12 },
  { value: "K25_50K", weight: 18 },
  { value: "K50_75K", weight: 22 },
  { value: "K75_100K", weight: 20 },
  { value: "K100_150K", weight: 15 },
  { value: "K150_200K", weight: 8 },
  { value: "OVER_200K", weight: 5 },
  { value: "PREFER_NOT_TO_SAY", weight: 4 },
];

export const FAMILIES: { value: string; weight: number }[] = [
  { value: "SINGLE_NO_KIDS", weight: 26 },
  { value: "SINGLE_WITH_KIDS", weight: 10 },
  { value: "COUPLE_NO_KIDS", weight: 24 },
  { value: "COUPLE_WITH_KIDS", weight: 27 },
  { value: "MULTIGENERATIONAL", weight: 7 },
  { value: "ROOMMATES", weight: 6 },
  { value: "OTHER", weight: 3 },
  { value: "PREFER_NOT_TO_SAY", weight: 2 },
];
