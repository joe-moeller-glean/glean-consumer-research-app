"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, Field } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/api-client";
import { ResponsesTable } from "./responses-table";
import type { LegView, Integrations } from "./study-workspace";

type FileRow = {
  id: string;
  originalFilename: string;
  storedFilename: string;
  fileType: string;
  sizeBytes: number;
  rowCount: number | null;
  status: string;
  error: string | null;
  legId: string;
  uploadedAt: string;
};

type BatchRow = {
  id: string;
  fireworksJobId: string | null;
  requestCount: number;
  status: string;
  error: string | null;
  submittedAt: string;
};

const ACTIVE_STATUSES = new Set(["UPLOADED", "PARSING", "PARSED", "PROCESSING"]);

export function DataTab({
  studyId,
  legs,
  canWrite,
  integrations,
}: {
  studyId: string;
  legs: LegView[];
  canWrite: boolean;
  integrations: Integrations;
}) {
  const router = useRouter();
  const [files, setFiles] = useState<FileRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [legId, setLegId] = useState(legs[0]?.id ?? "");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiRequest<{ files: FileRow[]; batches: BatchRow[] }>(`/api/studies/${studyId}/data`);
      setFiles(res.files);
      setBatches(res.batches);
      return res.files;
    } catch (e) {
      setError((e as Error).message);
      return [];
    }
  }, [studyId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while anything is still parsing or classifying, then refresh the page
  // data so the charts pick up new sentiment results.
  useEffect(() => {
    const active = files.some((f) => ACTIVE_STATUSES.has(f.status));
    if (!active) return;
    const t = setTimeout(async () => {
      const updated = await load();
      if (!updated.some((f) => ACTIVE_STATUSES.has(f.status))) router.refresh();
    }, 4000);
    return () => clearTimeout(t);
  }, [files, load, router]);

  const onDrop = useCallback(
    async (accepted: File[]) => {
      if (accepted.length === 0) return;
      setUploading(true);
      setError("");
      try {
        const body = new FormData();
        if (legId) body.append("legId", legId);
        for (const file of accepted) body.append("files", file);

        const res = await fetch(`/api/studies/${studyId}/uploads`, { method: "POST", body });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Upload failed");
        await load();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setUploading(false);
      }
    },
    [legId, studyId, load]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: !canWrite || uploading,
    accept: { "text/csv": [".csv"], "application/zip": [".zip"] },
  });

  async function deleteFile(id: string) {
    if (!confirm("Delete this file and all responses parsed from it?")) return;
    try {
      await apiRequest(`/api/study-data/${id}`, { method: "DELETE" });
      await load();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      {canWrite && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload consumer feedback</CardTitle>
            <CardDescription>
              One CSV, several CSVs, or a ZIP of CSVs. Required columns: <code>panelist_id</code> and{" "}
              <code>feedback</code>. Optional: <code>question</code> plus demographics (
              <code>age</code>, <code>sex</code>, <code>race</code>, <code>country</code>, <code>state</code>,{" "}
              <code>city</code>, <code>household_income</code>, <code>family_makeup</code>).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {legs.length > 1 && (
              <Field label="Upload into leg">
                <Select value={legId} onChange={(e) => setLegId(e.target.value)}>
                  {legs.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                      {l.testVariant ? ` — ${l.testVariant}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <div
              {...getRootProps()}
              className={`cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
                isDragActive ? "border-primary bg-primary/5" : "hover:border-primary/50"
              }`}
            >
              <input {...getInputProps()} />
              <p className="text-sm font-medium">
                {uploading ? "Uploading..." : isDragActive ? "Drop files here" : "Drag files here, or click to browse"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Stored as &lt;study id&gt;_&lt;leg id&gt;__&lt;filename&gt;
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              Sentiment model: <span className="font-medium">{integrations.sentimentModel}</span>
              {!integrations.fireworksLive && " (mock mode — set Fireworks credentials for real batch inference)"}
            </p>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Uploaded files</CardTitle>
          <CardDescription>File metadata and processing status</CardDescription>
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground">No files uploaded yet.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>File</TH>
                  <TH>Type</TH>
                  <TH>Rows</TH>
                  <TH>Size</TH>
                  <TH>Status</TH>
                  <TH>Uploaded</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {files.map((f) => (
                  <TR key={f.id}>
                    <TD>
                      <div className="font-medium">{f.originalFilename}</div>
                      <div className="max-w-md truncate font-mono text-xs text-muted-foreground">
                        {f.storedFilename}
                      </div>
                      {f.error && <div className="mt-1 max-w-md text-xs text-amber-700">{f.error}</div>}
                    </TD>
                    <TD>
                      <Badge tone={f.fileType === "ZIP" ? "blue" : "gray"}>{f.fileType}</Badge>
                    </TD>
                    <TD>{f.rowCount ?? "—"}</TD>
                    <TD className="text-xs text-muted-foreground">{(f.sizeBytes / 1024).toFixed(1)} KB</TD>
                    <TD>
                      <StatusBadge status={f.status} />
                    </TD>
                    <TD className="text-xs text-muted-foreground">
                      {new Date(f.uploadedAt).toLocaleString()}
                    </TD>
                    <TD>
                      <div className="flex gap-2">
                        <a
                          href={`/api/study-data/${f.id}?download=1`}
                          className="text-xs text-primary hover:underline"
                        >
                          Download
                        </a>
                        {canWrite && (
                          <button
                            onClick={() => deleteFile(f.id)}
                            className="text-xs text-destructive hover:underline"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {batches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fireworks batch jobs</CardTitle>
            <CardDescription>Batch inference runs that produced the sentiment labels</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Job</TH>
                  <TH>Requests</TH>
                  <TH>Status</TH>
                  <TH>Submitted</TH>
                </TR>
              </THead>
              <TBody>
                {batches.map((b) => (
                  <TR key={b.id}>
                    <TD className="font-mono text-xs">{b.fireworksJobId ?? "—"}</TD>
                    <TD>{b.requestCount}</TD>
                    <TD>
                      <StatusBadge status={b.status} />
                      {b.error && <div className="mt-1 text-xs text-amber-700">{b.error}</div>}
                    </TD>
                    <TD className="text-xs text-muted-foreground">
                      {new Date(b.submittedAt).toLocaleString()}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <ResponsesTable studyId={studyId} legs={legs} canWrite={canWrite} />
    </div>
  );
}
