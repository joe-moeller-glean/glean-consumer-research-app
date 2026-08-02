import { describe, it, expect } from "vitest";
import path from "path";
import { storedFilename, storagePath, studyDir, sanitizeFilename } from "@/lib/storage";

const STUDY = "11111111-1111-1111-1111-111111111111";
const LEG = "22222222-2222-2222-2222-222222222222";

describe("storedFilename", () => {
  it("prefixes the study id and leg id as specified", () => {
    expect(storedFilename(STUDY, LEG, "feedback.csv")).toBe(`${STUDY}_${LEG}__feedback.csv`);
  });

  it("sanitizes characters that could escape the upload directory", () => {
    const name = storedFilename(STUDY, LEG, "../../etc/passwd");
    expect(name).not.toContain("/");
    expect(name).not.toContain("..");
    expect(name.startsWith(`${STUDY}_${LEG}__`)).toBe(true);
  });

  it("sanitizes spaces and shell metacharacters", () => {
    const name = storedFilename(STUDY, LEG, "my file; rm -rf *.csv");
    expect(name).toMatch(/^[0-9a-f-]+_[0-9a-f-]+__[a-zA-Z0-9._-]+$/);
  });

  it("keeps names bounded in length", () => {
    const name = storedFilename(STUDY, LEG, "a".repeat(500) + ".csv");
    expect(name.length).toBeLessThanOrEqual(STUDY.length + LEG.length + 2 + 1 + 180);
  });
});

describe("storagePath", () => {
  it("places files in a directory named after the study id", () => {
    const full = storagePath(STUDY, LEG, "data.csv");
    expect(path.dirname(full)).toBe(studyDir(STUDY));
    expect(path.basename(full)).toBe(`${STUDY}_${LEG}__data.csv`);
  });

  it("cannot be redirected outside the study directory by a crafted filename", () => {
    const full = storagePath(STUDY, LEG, "../../../../tmp/evil.csv");
    expect(path.dirname(full)).toBe(studyDir(STUDY));
  });
});

describe("sanitizeFilename", () => {
  it("strips directory components", () => {
    expect(sanitizeFilename("/etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\data\\feedback.csv")).toBe("feedback.csv");
  });

  it("never returns a hidden or empty name", () => {
    expect(sanitizeFilename(".env")).toBe("env");
    expect(sanitizeFilename("...")).toBe("upload.csv");
    expect(sanitizeFilename("")).toBe("upload.csv");
  });
});
