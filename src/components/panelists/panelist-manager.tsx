"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/api-client";
import { SEX_LABELS, INCOME_LABELS, FAMILY_MAKEUP_LABELS } from "@/lib/labels";
import { PanelistFields, EMPTY_PANELIST, toPanelistPayload, type PanelistFormValues } from "./panelist-form";

type Row = {
  panelist: {
    id: string;
    panelistId: string;
    age: number | null;
    sex: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    householdIncome: string | null;
    familyMakeup: string | null;
    isStub: boolean;
  };
  studyCount: number;
  legCount: number;
  responseCount: number;
};

/** Panelist CRUD, including completing records auto-created during CSV import. */
export function PanelistManager({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [stubsOnly, setStubsOnly] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PanelistFormValues>(EMPTY_PANELIST);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (stubsOnly) params.set("stubs", "1");
      const res = await apiRequest<{ panelists: Row[] }>(`/api/panelists?${params}`);
      setRows(res.panelists);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [search, stubsOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiRequest("/api/panelists", { method: "POST", body: toPanelistPayload(form, true) });
      setOpen(false);
      setForm(EMPTY_PANELIST);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, label: string) {
    if (!confirm(`Delete panelist ${label}? Their responses will be kept but unlinked.`)) return;
    try {
      await apiRequest(`/api/panelists/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const stubCount = rows.filter((r) => r.panelist.isStub).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Panelists</h1>
          <p className="text-sm text-muted-foreground">
            Participants and their demographics, reused across studies
          </p>
        </div>
        {canWrite && <Button onClick={() => setOpen(true)}>New panelist</Button>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query);
          }}
          className="flex gap-2"
        >
          <Input
            placeholder="Search by ID, city, or state..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-72"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={stubsOnly} onChange={(e) => setStubsOnly(e.target.checked)} />
          Incomplete only{stubCount > 0 && !stubsOnly ? ` (${stubCount} on this page)` : ""}
        </label>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="font-medium">No panelists</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Panelists are created here, or automatically when a CSV references an unknown panelist ID.
          </p>
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Panelist ID</TH>
              <TH>Age</TH>
              <TH>Sex</TH>
              <TH>Region</TH>
              <TH>Income</TH>
              <TH>Family</TH>
              <TH>Studies</TH>
              <TH>Legs</TH>
              <TH>Responses</TH>
              {canWrite && <TH />}
            </TR>
          </THead>
          <TBody>
            {rows.map(({ panelist: p, studyCount, legCount, responseCount }) => (
              <TR key={p.id}>
                <TD>
                  <Link href={`/panelists/${p.id}`} className="font-mono text-xs text-primary hover:underline">
                    {p.panelistId}
                  </Link>
                  {p.isStub && (
                    <Badge tone="amber" className="ml-2">
                      incomplete
                    </Badge>
                  )}
                </TD>
                <TD>{p.age ?? "—"}</TD>
                <TD>{p.sex ? SEX_LABELS[p.sex] : "—"}</TD>
                <TD className="text-xs">{[p.city, p.state, p.country].filter(Boolean).join(", ") || "—"}</TD>
                <TD className="text-xs">{p.householdIncome ? INCOME_LABELS[p.householdIncome] : "—"}</TD>
                <TD className="text-xs">{p.familyMakeup ? FAMILY_MAKEUP_LABELS[p.familyMakeup] : "—"}</TD>
                <TD>{studyCount}</TD>
                <TD>{legCount}</TD>
                <TD>{responseCount}</TD>
                {canWrite && (
                  <TD>
                    <button
                      onClick={() => remove(p.id, p.panelistId)}
                      className="text-xs text-destructive hover:underline"
                    >
                      Delete
                    </button>
                  </TD>
                )}
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="New panelist">
        <form onSubmit={create} className="space-y-4">
          <PanelistFields values={form} onChange={setForm} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating..." : "Create panelist"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
