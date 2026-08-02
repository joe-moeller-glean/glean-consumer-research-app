"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { apiRequest } from "@/lib/api-client";
import type { StudyView, LegView } from "./study-workspace";

/** Edit study metadata, manage legs, and delete the study. */
export function SettingsTab({
  study,
  legs,
  canWrite,
}: {
  study: StudyView;
  legs: LegView[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: study.name,
    product: study.product,
    productVersion: study.productVersion,
    testCriteria: study.testCriteria,
    category: study.category ?? "",
    description: study.description ?? "",
    status: study.status,
    targetPanelSize: study.targetPanelSize?.toString() ?? "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [newLeg, setNewLeg] = useState({ name: "", testVariant: "" });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiRequest(`/api/studies/${study.id}`, {
        method: "PATCH",
        body: {
          ...form,
          category: form.category || null,
          description: form.description || null,
          targetPanelSize: form.targetPanelSize ? Number(form.targetPanelSize) : null,
        },
      });
      setMessage("Saved");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addLeg(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await apiRequest(`/api/studies/${study.id}/legs`, {
        method: "POST",
        body: {
          name: newLeg.name,
          testVariant: newLeg.testVariant || null,
          sequence: legs.length + 1,
        },
      });
      setNewLeg({ name: "", testVariant: "" });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deleteLeg(id: string) {
    if (!confirm("Delete this leg?")) return;
    setError("");
    try {
      await apiRequest(`/api/legs/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deleteStudy() {
    if (!confirm(`Delete "${study.name}" and all of its data? This cannot be undone.`)) return;
    setError("");
    try {
      await apiRequest(`/api/studies/${study.id}`, { method: "DELETE" });
      router.push("/");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Study metadata</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <Field label="Study name">
              <Input value={form.name} onChange={set("name")} required disabled={!canWrite} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Product">
                <Input value={form.product} onChange={set("product")} required disabled={!canWrite} />
              </Field>
              <Field label="Product version">
                <Input value={form.productVersion} onChange={set("productVersion")} required disabled={!canWrite} />
              </Field>
            </div>
            <Field label="Test criteria">
              <Textarea value={form.testCriteria} onChange={set("testCriteria")} required disabled={!canWrite} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Category">
                <Input value={form.category} onChange={set("category")} disabled={!canWrite} />
              </Field>
              <Field label="Target panel size">
                <Input type="number" min={1} value={form.targetPanelSize} onChange={set("targetPanelSize")} disabled={!canWrite} />
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={set("status")} disabled={!canWrite}>
                  <option value="DRAFT">Draft</option>
                  <option value="COLLECTING">Collecting</option>
                  <option value="PROCESSING">Processing</option>
                  <option value="ANALYZED">Analyzed</option>
                  <option value="ARCHIVED">Archived</option>
                </Select>
              </Field>
            </div>
            <Field label="Description">
              <Textarea value={form.description} onChange={set("description")} disabled={!canWrite} />
            </Field>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {message && <p className="text-sm text-green-700">{message}</p>}

            {canWrite && (
              <Button type="submit" disabled={busy}>
                {busy ? "Saving..." : "Save changes"}
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Legs</CardTitle>
          <CardDescription>
            A study has one or more legs; each leg tests something different and holds its own uploads.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>Name</TH>
                <TH>Test variant</TH>
                {canWrite && <TH />}
              </TR>
            </THead>
            <TBody>
              {legs.map((l) => (
                <TR key={l.id}>
                  <TD>{l.sequence}</TD>
                  <TD className="font-medium">{l.name}</TD>
                  <TD className="text-muted-foreground">{l.testVariant ?? "—"}</TD>
                  {canWrite && (
                    <TD>
                      {legs.length > 1 && (
                        <button onClick={() => deleteLeg(l.id)} className="text-xs text-destructive hover:underline">
                          Delete
                        </button>
                      )}
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>

          {canWrite && (
            <form onSubmit={addLeg} className="flex flex-wrap items-end gap-2 border-t pt-4">
              <div className="w-48">
                <Field label="New leg name">
                  <Input
                    value={newLeg.name}
                    onChange={(e) => setNewLeg((l) => ({ ...l, name: e.target.value }))}
                    required
                    placeholder="Leg 2"
                  />
                </Field>
              </div>
              <div className="w-56">
                <Field label="Test variant (optional)">
                  <Input
                    value={newLeg.testVariant}
                    onChange={(e) => setNewLeg((l) => ({ ...l, testVariant: e.target.value }))}
                    placeholder="Formula B"
                  />
                </Field>
              </div>
              <Button type="submit" variant="outline">
                Add leg
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {canWrite && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
            <CardDescription>
              Deleting a study removes its legs, uploaded files, parsed responses, and analyses.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={deleteStudy}>
              Delete study
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
