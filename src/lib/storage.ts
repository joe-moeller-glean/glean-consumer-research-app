import fs from "fs/promises";
import path from "path";
import { env } from "@/lib/env";

/**
 * Upload storage layout (from PLAN.md):
 *   <UPLOADS_DIR>/<studyId>/<studyId>_<legId>__<original-filename>
 *
 * Callers must pass validated UUIDs for studyId/legId (see requireUuid), and
 * every original filename is sanitized here so a crafted upload name can never
 * escape the study directory.
 */

const MAX_NAME_LENGTH = 180;

export function studyDir(studyId: string): string {
  return path.join(env.uploadsDir, studyId);
}

/** Reduce an arbitrary upload name to a safe, flat filename. */
export function sanitizeFilename(originalFilename: string): string {
  // Normalize Windows separators first so path.basename strips those components
  // too (on POSIX it would otherwise return the whole "C:\dir\file" string).
  const base = path.basename(originalFilename.replace(/\\/g, "/"));
  const safe = base
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    // Collapse dot runs so traversal sequences cannot survive.
    .replace(/\.{2,}/g, ".")
    // Never allow a leading dot (hidden files) or separator-ish prefix.
    .replace(/^[._-]+/, "");
  const trimmed = safe.slice(0, MAX_NAME_LENGTH);
  return trimmed.length > 0 ? trimmed : "upload.csv";
}

export function storedFilename(studyId: string, legId: string, originalFilename: string): string {
  return `${studyId}_${legId}__${sanitizeFilename(originalFilename)}`;
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
  const dir = studyDir(studyId);
  await fs.mkdir(dir, { recursive: true });

  const stored = storedFilename(studyId, legId, originalFilename);
  const full = path.join(dir, stored);

  // Defence in depth: the resolved path must stay inside the study directory.
  if (!path.resolve(full).startsWith(path.resolve(dir) + path.sep)) {
    throw new Error("Refusing to write outside the study upload directory");
  }

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
