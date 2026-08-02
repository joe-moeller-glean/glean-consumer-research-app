import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
  studyCreateSchema,
  panelistCreateSchema,
  userCreateSchema,
  responseUpdateSchema,
  sentimentOutputSchema,
} from "@/lib/validation";
import { requireUuid, apiError, ApiError } from "@/lib/http";

describe("studyCreateSchema", () => {
  it("requires the core study metadata", () => {
    expect(
      studyCreateSchema.safeParse({
        name: "Test",
        product: "Water",
        productVersion: "v1",
        testCriteria: "Taste",
      }).success
    ).toBe(true);
    expect(studyCreateSchema.safeParse({ name: "Test" }).success).toBe(false);
  });

  it("defaults status to DRAFT", () => {
    const parsed = studyCreateSchema.parse({
      name: "T",
      product: "P",
      productVersion: "v1",
      testCriteria: "C",
    });
    expect(parsed.status).toBe("DRAFT");
  });

  it("rejects an unknown status", () => {
    expect(
      studyCreateSchema.safeParse({
        name: "T",
        product: "P",
        productVersion: "v1",
        testCriteria: "C",
        status: "BOGUS",
      }).success
    ).toBe(false);
  });
});

describe("panelistCreateSchema", () => {
  it("requires a panelist id and validates enums", () => {
    expect(panelistCreateSchema.safeParse({ panelistId: "P-1" }).success).toBe(true);
    expect(panelistCreateSchema.safeParse({ panelistId: "P-1", sex: "MALE" }).success).toBe(true);
    expect(panelistCreateSchema.safeParse({ panelistId: "P-1", sex: "male" }).success).toBe(false);
    expect(panelistCreateSchema.safeParse({}).success).toBe(false);
  });

  it("bounds age to a plausible range", () => {
    expect(panelistCreateSchema.safeParse({ panelistId: "P-1", age: 130 }).success).toBe(false);
    expect(panelistCreateSchema.safeParse({ panelistId: "P-1", age: -1 }).success).toBe(false);
  });
});

describe("userCreateSchema", () => {
  it("enforces a valid email and minimum password length", () => {
    expect(
      userCreateSchema.safeParse({ email: "a@b.com", name: "A", password: "longenough" }).success
    ).toBe(true);
    expect(userCreateSchema.safeParse({ email: "nope", name: "A", password: "longenough" }).success).toBe(false);
    expect(userCreateSchema.safeParse({ email: "a@b.com", name: "A", password: "short" }).success).toBe(false);
  });

  it("defaults new users to the RESEARCHER role", () => {
    expect(userCreateSchema.parse({ email: "a@b.com", name: "A", password: "longenough" }).role).toBe(
      "RESEARCHER"
    );
  });
});

describe("responseUpdateSchema", () => {
  it("only allows the three sentiment classes", () => {
    expect(responseUpdateSchema.safeParse({ sentiment: "LIKE" }).success).toBe(true);
    expect(responseUpdateSchema.safeParse({ sentiment: "NEUTRAL" }).success).toBe(false);
  });
});

describe("sentimentOutputSchema", () => {
  it("normalizes model casing and rejects out-of-range confidence", () => {
    expect(sentimentOutputSchema.parse({ sentiment: "like", confidence: 0.5 }).sentiment).toBe("LIKE");
    expect(sentimentOutputSchema.safeParse({ sentiment: "like", confidence: 1.5 }).success).toBe(false);
  });
});

describe("requireUuid", () => {
  it("accepts a valid uuid", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    expect(requireUuid(id)).toBe(id);
  });

  it("rejects path traversal and junk values with a 400", () => {
    for (const bad of ["../../etc/passwd", "not-a-uuid", "", "1; DROP TABLE studies"]) {
      expect(() => requireUuid(bad, "study id")).toThrowError(ApiError);
      try {
        requireUuid(bad);
      } catch (e) {
        expect((e as ApiError).status).toBe(400);
      }
    }
  });
});

describe("apiError", () => {
  it("maps validation errors to 400 with issue details", async () => {
    let err: unknown;
    try {
      userCreateSchema.parse({ email: "bad", name: "", password: "x" });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ZodError);

    const res = apiError(err);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: unknown[] };
    expect(body.error).toBe("Validation failed");
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("preserves ApiError status codes", async () => {
    const res = apiError(new ApiError(403, "Read-only account"));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("Read-only account");
  });

  it("never leaks internal error details", async () => {
    const res = apiError(new Error("connection string postgres://user:password@host"));
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toBe("Internal server error");
  });
});
