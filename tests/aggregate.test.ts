import { describe, it, expect } from "vitest";
import { summarize, householdSizeBucket, childrenBucket, type AggregateInputRow } from "@/lib/aggregate";
import { ageBand } from "@/lib/demographics";

const LEGS = [
  { id: "leg-1", name: "Leg 1", sequence: 1 },
  { id: "leg-2", name: "Leg 2", sequence: 2 },
];

function row(overrides: Partial<AggregateInputRow> = {}): AggregateInputRow {
  return {
    sentiment: "LIKE",
    legId: "leg-1",
    age: 30,
    sex: "FEMALE",
    race: "ASIAN",
    country: "United States",
    state: "TX",
    city: "Austin",
    householdIncome: "K50_75K",
    familyMakeup: "COUPLE_NO_KIDS",
    householdSize: 2,
    childrenCount: 0,
    ...overrides,
  };
}

describe("ageBand", () => {
  it("maps ages into the documented ranges", () => {
    expect(ageBand(17)).toBe("Under 18");
    expect(ageBand(18)).toBe("18–24");
    expect(ageBand(24)).toBe("18–24");
    expect(ageBand(25)).toBe("25–34");
    expect(ageBand(44)).toBe("35–44");
    expect(ageBand(64)).toBe("55–64");
    expect(ageBand(65)).toBe("65+");
    expect(ageBand(99)).toBe("65+");
  });

  it("returns Unknown when age is missing", () => {
    expect(ageBand(null)).toBe("Unknown");
    expect(ageBand(undefined)).toBe("Unknown");
  });
});

describe("household buckets", () => {
  it("buckets household size", () => {
    expect(householdSizeBucket(null)).toBe("Unknown");
    expect(householdSizeBucket(1)).toBe("1 person");
    expect(householdSizeBucket(3)).toBe("3 people");
    expect(householdSizeBucket(9)).toBe("5+ people");
  });

  it("buckets children count", () => {
    expect(childrenBucket(null)).toBe("Unknown");
    expect(childrenBucket(0)).toBe("No children");
    expect(childrenBucket(1)).toBe("1 child");
    expect(childrenBucket(2)).toBe("2 children");
    expect(childrenBucket(4)).toBe("3+ children");
  });
});

describe("summarize", () => {
  it("counts overall sentiment and percentages", () => {
    const summary = summarize(
      "study-1",
      [
        row({ sentiment: "LIKE" }),
        row({ sentiment: "LIKE" }),
        row({ sentiment: "DISLIKE" }),
        row({ sentiment: "INDIFFERENT" }),
      ],
      LEGS
    );

    expect(summary.overall.LIKE).toBe(2);
    expect(summary.overall.DISLIKE).toBe(1);
    expect(summary.overall.INDIFFERENT).toBe(1);
    expect(summary.overall.total).toBe(4);
    expect(summary.overall.likePct).toBe(50);
    expect(summary.overall.dislikePct).toBe(25);
  });

  it("excludes unanalyzed rows from breakdowns but counts them in the total", () => {
    const summary = summarize("study-1", [row({ sentiment: "LIKE" }), row({ sentiment: null })], LEGS);

    expect(summary.totalResponses).toBe(2);
    expect(summary.analyzedResponses).toBe(1);
    expect(summary.overall.total).toBe(1);
  });

  it("splits counts per leg and includes legs with no responses", () => {
    const summary = summarize(
      "study-1",
      [
        row({ legId: "leg-1", sentiment: "LIKE" }),
        row({ legId: "leg-1", sentiment: "DISLIKE" }),
        row({ legId: "leg-2", sentiment: "LIKE" }),
      ],
      [...LEGS, { id: "leg-3", name: "Leg 3", sequence: 3 }]
    );

    expect(summary.byLeg).toHaveLength(3);
    expect(summary.byLeg[0]).toMatchObject({ legId: "leg-1", LIKE: 1, DISLIKE: 1, total: 2 });
    expect(summary.byLeg[1]).toMatchObject({ legId: "leg-2", LIKE: 1, total: 1 });
    expect(summary.byLeg[2]).toMatchObject({ legId: "leg-3", total: 0 });
  });

  it("buckets each demographic dimension with display labels", () => {
    const summary = summarize(
      "study-1",
      [
        row({ age: 22, sex: "MALE", householdIncome: "UNDER_25K", familyMakeup: "SINGLE_NO_KIDS", sentiment: "LIKE" }),
        row({ age: 70, sex: "FEMALE", householdIncome: "OVER_200K", familyMakeup: "MULTIGENERATIONAL", sentiment: "DISLIKE" }),
      ],
      LEGS
    );

    expect(summary.demographics.age.map((r) => r.bucket)).toEqual(["18–24", "65+"]);
    expect(summary.demographics.sex.map((r) => r.label)).toEqual(["Male", "Female"]);
    expect(summary.demographics.income.map((r) => r.label)).toEqual(["Under $25k", "Over $200k"]);
    expect(summary.demographics.familyMakeup.map((r) => r.label)).toEqual([
      "Single, no kids",
      "Multigenerational household",
    ]);
  });

  it("groups missing demographics under Unknown", () => {
    const summary = summarize("study-1", [row({ sex: null, race: null, householdIncome: null })], LEGS);
    expect(summary.demographics.sex[0].bucket).toBe("Unknown");
    expect(summary.demographics.race[0].bucket).toBe("Unknown");
    expect(summary.demographics.income[0].bucket).toBe("Unknown");
  });

  it("rolls regions up by country, state, and city, sorted by volume", () => {
    const summary = summarize(
      "study-1",
      [
        row({ country: "United States", state: "TX", city: "Austin" }),
        row({ country: "United States", state: "TX", city: "Austin" }),
        row({ country: "Canada", state: "ON", city: "Toronto" }),
      ],
      LEGS
    );

    expect(summary.regions.country[0]).toMatchObject({ bucket: "United States", total: 2 });
    expect(summary.regions.country[1]).toMatchObject({ bucket: "Canada", total: 1 });
    expect(summary.regions.city[0].bucket).toBe("Austin");
  });

  it("omits regions when the panelist has no location", () => {
    const summary = summarize("study-1", [row({ country: null, state: null, city: null })], LEGS);
    expect(summary.regions.country).toHaveLength(0);
    expect(summary.regions.state).toHaveLength(0);
  });

  it("computes per-bucket percentages that sum to 100", () => {
    const summary = summarize(
      "study-1",
      [
        row({ sex: "MALE", sentiment: "LIKE" }),
        row({ sex: "MALE", sentiment: "DISLIKE" }),
        row({ sex: "MALE", sentiment: "INDIFFERENT" }),
        row({ sex: "MALE", sentiment: "LIKE" }),
      ],
      LEGS
    );

    const male = summary.demographics.sex[0];
    expect(male.total).toBe(4);
    expect(male.likePct).toBe(50);
    expect(male.dislikePct).toBe(25);
    expect(male.indifferentPct).toBe(25);
    expect(male.likePct + male.dislikePct + male.indifferentPct).toBe(100);
  });

  it("returns zeroed totals for an empty study", () => {
    const summary = summarize("study-1", [], LEGS);
    expect(summary.overall.total).toBe(0);
    expect(summary.overall.likePct).toBe(0);
    expect(summary.analyzedResponses).toBe(0);
  });
});
