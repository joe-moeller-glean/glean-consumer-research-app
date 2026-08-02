import { describe, it, expect } from "vitest";
import { normalizeHeader, normalizeRecord, applyAliases, csvRowSchema, RESERVED_COLUMNS } from "@/lib/csv";

describe("normalizeHeader", () => {
  it("converts headers to lowercase snake case", () => {
    expect(normalizeHeader("Panelist ID")).toBe("panelist_id");
    expect(normalizeHeader("Household Income")).toBe("household_income");
    expect(normalizeHeader("  Feedback  ")).toBe("feedback");
    expect(normalizeHeader("Family-Makeup")).toBe("family_makeup");
    expect(normalizeHeader("What did you think?")).toBe("what_did_you_think");
  });
});

describe("normalizeRecord + applyAliases", () => {
  it("normalizes all keys in a record", () => {
    expect(normalizeRecord({ "Panelist ID": "P-1", Feedback: "Nice" })).toEqual({
      panelist_id: "P-1",
      feedback: "Nice",
    });
  });

  it("maps common column aliases onto the canonical names", () => {
    expect(applyAliases({ panelist: "P-1", verbatim: "Tasty", prompt: "Q1" })).toEqual({
      panelist_id: "P-1",
      feedback: "Tasty",
      question: "Q1",
    });
    expect(applyAliases({ respondent_id: "P-2", comment: "Meh" })).toMatchObject({
      panelist_id: "P-2",
      feedback: "Meh",
    });
  });

  it("does not override an explicit canonical column", () => {
    const result = applyAliases({ panelist_id: "P-1", panelist: "P-WRONG", feedback: "ok" });
    expect(result.panelist_id).toBe("P-1");
  });
});

describe("csvRowSchema", () => {
  it("accepts a minimal valid row", () => {
    const parsed = csvRowSchema.safeParse({ panelist_id: "P-1", feedback: "Great flavor" });
    expect(parsed.success).toBe(true);
  });

  it("requires panelist_id and feedback", () => {
    expect(csvRowSchema.safeParse({ feedback: "Great" }).success).toBe(false);
    expect(csvRowSchema.safeParse({ panelist_id: "P-1" }).success).toBe(false);
    expect(csvRowSchema.safeParse({ panelist_id: "P-1", feedback: "" }).success).toBe(false);
  });

  it("coerces numeric demographics and treats blanks as null", () => {
    const parsed = csvRowSchema.parse({
      panelist_id: "P-1",
      feedback: "Nice",
      age: "34",
      household_size: "",
      city: "  Austin  ",
    });
    expect(parsed.age).toBe(34);
    expect(parsed.household_size).toBeNull();
    expect(parsed.city).toBe("Austin");
  });

  it("exposes reserved columns so extras can be kept separately", () => {
    expect(RESERVED_COLUMNS.has("panelist_id")).toBe(true);
    expect(RESERVED_COLUMNS.has("feedback")).toBe(true);
    expect(RESERVED_COLUMNS.has("purchase_intent")).toBe(false);
  });
});
