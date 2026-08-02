"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge, SentimentBadge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/api-client";
import { PanelistFields, toPanelistPayload, type PanelistFormValues } from "./panelist-form";

type Panelist = {
  id: string;
  panelistId: string;
  age: number | null;
  sex: string | null;
  race: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  householdIncome: string | null;
  familyMakeup: string | null;
  householdSize: number | null;
  childrenCount: number | null;
  notes: string | null;
  isStub: boolean;
};

type Participation = {
  response: { id: string; feedbackText: string; sentiment: string | null; createdAt: string };
  study: { id: string; name: string; product: string; productVersion: string };
  leg: { id: string; name: string; sequence: number };
};

function toForm(p: Panelist): PanelistFormValues {
  return {
    panelistId: p.panelistId,
    age: p.age?.toString() ?? "",
    sex: p.sex ?? "",
    race: p.race ?? "",
    country: p.country ?? "",
    state: p.state ?? "",
    city: p.city ?? "",
    householdIncome: p.householdIncome ?? "",
    familyMakeup: p.familyMakeup ?? "",
    householdSize: p.householdSize?.toString() ?? "",
    childrenCount: p.childrenCount?.toString() ?? "",
    notes: p.notes ?? "",
  };
}

export function PanelistDetail({ panelist, canWrite }: { panelist: Panelist; canWrite: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState<PanelistFormValues>(toForm(panelist));
  const [participation, setParticipation] = useState<Participation[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiRequest<{ participation: Participation[] }>(`/api/panelists/${panelist.id}/participation`)
      .then((res) => setParticipation(res.participation))
      .catch((e) => setError((e as Error).message));
  }, [panelist.id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiRequest(`/api/panelists/${panelist.id}`, {
        method: "PATCH",
        body: toPanelistPayload(form, false),
      });
      setMessage("Saved. Demographic charts will reflect this immediately.");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Group a flat participation list into studies -> legs.
  const studies = new Map<string, { name: string; product: string; version: string; legs: Set<string> }>();
  for (const p of participation) {
    const entry = studies.get(p.study.id) ?? {
      name: p.study.name,
      product: p.study.product,
      version: p.study.productVersion,
      legs: new Set<string>(),
    };
    entry.legs.add(p.leg.name);
    studies.set(p.study.id, entry);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/panelists" className="text-sm text-muted-foreground hover:underline">
          &larr; Panelists
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold">{panelist.panelistId}</h1>
          {panelist.isStub && <Badge tone="amber">incomplete</Badge>}
        </div>
        {panelist.isStub && (
          <p className="mt-1 text-sm text-muted-foreground">
            Auto-created during CSV import. Fill in demographics to include this panelist in segment breakdowns.
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Demographics</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={save} className="space-y-4">
              <PanelistFields values={form} onChange={setForm} lockId disabled={!canWrite} />
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

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Studies participated in</CardTitle>
              <CardDescription>{studies.size} studies</CardDescription>
            </CardHeader>
            <CardContent>
              {studies.size === 0 ? (
                <p className="text-sm text-muted-foreground">No participation recorded.</p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Study</TH>
                      <TH>Product</TH>
                      <TH>Legs</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {[...studies.entries()].map(([id, s]) => (
                      <TR key={id}>
                        <TD>
                          <Link href={`/studies/${id}`} className="text-primary hover:underline">
                            {s.name}
                          </Link>
                        </TD>
                        <TD className="text-xs text-muted-foreground">
                          {s.product} {s.version}
                        </TD>
                        <TD className="text-xs">{[...s.legs].join(", ")}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Responses</CardTitle>
              <CardDescription>{participation.length} feedback rows</CardDescription>
            </CardHeader>
            <CardContent>
              {participation.length === 0 ? (
                <p className="text-sm text-muted-foreground">No responses.</p>
              ) : (
                <div className="space-y-3">
                  {participation.slice(0, 25).map((p) => (
                    <div key={p.response.id} className="border-b pb-3 last:border-0">
                      <div className="flex items-center gap-2">
                        <SentimentBadge sentiment={p.response.sentiment} />
                        <span className="text-xs text-muted-foreground">
                          {p.study.name} · {p.leg.name}
                        </span>
                      </div>
                      <p className="mt-1 text-sm">{p.response.feedbackText}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
