import fs from "fs/promises";
import path from "path";
import { env } from "@/lib/env";

// Storage rule (from PLAN.md): /data/uploads/<studyId>/<studyId>_<legId>__<original-filename>

export function studyDir(studyId: string): string {
  return path.join(env.uploadsDir, studyId);
}

export function storedFilename(studyId: string, legId: string, originalFilename: string): string {
  const safe = originalFilename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-180);
  return `${studyId}_${legId}__${safe}`;
}

export function storagePath(studyId: string, legId: string, originalFilename: string): string {
  return path.join(studyDir(studyId), storedFilename(studyId, legId, originalFilename));
}

export async function saveBuffer(
  studyId: string,
  legId: string,
  originalFilename: string,
  buf: Buffer
): Promise<{ storedFilename: string; storagePath: string }> {
  await fs.mkdir(studyDir(studyId), { recursive: true });
  const stored = storedFilename(studyId, legId, originalFilename);
  const full = path.join(studyDir(studyId), stored);
  await fs.writeFile(full, buf);
  return { storedFilename: stored, storagePath: full };
}

export async function readFile(storagePathValue: string): Promise<Buffer> {
  return fs.readFile(storagePathValue);
}

export async function removeFile(storagePathValue: string): Promise<void> {
  await fs.unlink(storagePathValue).catch(() => undefined);
}

export async function removeStudyDir(studyId: string): Promise<void> {
  await fs.rm(studyDir(studyId), { recursive: true, force: true });
}
